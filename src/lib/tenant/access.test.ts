import { describe, expect, it, vi } from "vitest";
import { MembershipRole, MembershipStatus, Prisma, PrismaClient } from "@prisma/client";
import { requireTenantContext, requireTenantContextForPermission, TenantPermissionError, tenantCreateData, tenantWhere, withTenantTransaction } from "./access";
import { createTenantResource, deleteTenantResource, getTenantResource, listTenantResource, updateTenantResource } from "./resources";

describe("tenant boundaries", () => {
  it("refuses missing users and users without an active membership", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = { membership: { findFirst } } as unknown as PrismaClient;

    await expect(requireTenantContext(null, "org-a", client)).rejects.toThrow("Organization not found");
    await expect(requireTenantContext("user-a", "org-a", client)).rejects.toThrow("Organization not found");
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "user-a", organizationId: "org-a", status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
  });

  it("creates tenant context only for an active member of the requested organization", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "membership-a" });
    const client = { membership: { findFirst } } as unknown as PrismaClient;

    await expect(requireTenantContext("user-a", "org-a", client)).resolves.toEqual({
      userId: "user-a",
      organizationId: "org-a",
    });
  });

  it("applies the organization role matrix to resource permissions", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ role: MembershipRole.VIEWER })
      .mockResolvedValueOnce({ role: MembershipRole.MEMBER })
      .mockResolvedValueOnce({ role: MembershipRole.MEMBER })
      .mockResolvedValueOnce({ role: MembershipRole.ADMIN })
      .mockResolvedValueOnce({ role: MembershipRole.MEMBER })
      .mockResolvedValueOnce({ role: MembershipRole.OWNER });
    const client = { membership: { findFirst } } as unknown as PrismaClient;

    await expect(requireTenantContextForPermission("viewer", "org-a", "write", client))
      .rejects.toBeInstanceOf(TenantPermissionError);
    await expect(requireTenantContextForPermission("member", "org-a", "write", client))
      .resolves.toEqual({ userId: "member", organizationId: "org-a" });
    await expect(requireTenantContextForPermission("member", "org-a", "delete", client))
      .rejects.toBeInstanceOf(TenantPermissionError);
    await expect(requireTenantContextForPermission("admin", "org-a", "delete", client))
      .resolves.toEqual({ userId: "admin", organizationId: "org-a" });
    await expect(requireTenantContextForPermission("member", "org-a", "admin", client))
      .rejects.toBeInstanceOf(TenantPermissionError);
    await expect(requireTenantContextForPermission("owner", "org-a", "admin", client))
      .resolves.toEqual({ userId: "owner", organizationId: "org-a" });
    expect(findFirst).toHaveBeenCalledTimes(6);
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "viewer", organizationId: "org-a", status: MembershipStatus.ACTIVE },
      select: { role: true },
    });
  });

  it("sets transaction-local tenant context before scoped database work", async () => {
    const order: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (_strings: TemplateStringsArray, organizationId: string) => {
        order.push(`context:${organizationId}`);
        return 1;
      }),
    };
    const client = {
      $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<string>) => operation(tx)),
    } as unknown as Pick<PrismaClient, "$transaction">;

    const result = await withTenantTransaction(
      { userId: "user-a", organizationId: "org-a" },
      async () => {
        order.push("query");
        return "done";
      },
      client,
    );

    expect(result).toBe("done");
    expect(order).toEqual(["context:org-a", "query"]);
  });

  it("pins every record lookup to the authorized organization", () => {
    const records = [
      { id: "alert-a", organizationId: "org-a" },
      { id: "alert-b", organizationId: "org-b" },
    ];
    const where = tenantWhere("org-a", { id: "alert-b" });
    const result = records.find((record) => record.id === where.id && record.organizationId === where.organizationId);

    expect(where).toEqual({ id: "alert-b", organizationId: "org-a" });
    expect(result).toBeUndefined();
  });

  it("does not allow request data to override the authorized organization", () => {
    expect(tenantCreateData("org-a", { title: "CPU high", organizationId: "org-b" })).toEqual({
      title: "CPU high",
      organizationId: "org-a",
    });
  });

  it("blocks cross-tenant reads and updates in the tenant resource data access layer", async () => {
    const findFirst = vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
      const rows = [{ id: "alert-b", organizationId: "org-b", title: "Other tenant" }];
      return rows.find((row) => row.id === where.id && row.organizationId === where.organizationId) ?? null;
    });
    const updateMany = vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) => {
      const rows = [{ id: "alert-b", organizationId: "org-b" }];
      return { count: rows.filter((row) => row.id === where.id && row.organizationId === where.organizationId).length };
    });
    const client = { alert: { findFirst, updateMany } } as unknown as Prisma.TransactionClient;
    const tenant = { userId: "user-a", organizationId: "org-a" };

    expect(await getTenantResource(client, tenant, "alerts", "alert-b")).toBeNull();
    expect(await updateTenantResource(client, tenant, "alerts", "alert-b", { title: "overwrite", organizationId: "org-b" })).toEqual({ count: 0 });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "alert-b", organizationId: "org-a" } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "alert-b", organizationId: "org-a" },
      data: { title: "overwrite" },
    });
  });

  it("always assigns a created resource to the authorized organization", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const client = { alert: { create } } as unknown as Prisma.TransactionClient;
    const tenant = { userId: "user-a", organizationId: "org-a" };

    await createTenantResource(client, tenant, "alerts", {
      title: "CPU high",
      severity: "WARNING",
      organizationId: "org-b",
    });

    expect(create).toHaveBeenCalledWith({
      data: { title: "CPU high", severity: "WARNING", organizationId: "org-a" },
    });
  });

  it("scopes list, read, update, and delete operations for every tenant-owned resource", async () => {
    const names = ["integrations", "monitoring-sources", "alerts", "analysis-results"] as const;
    const delegate = {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const client = {
      ciCdIntegration: delegate,
      monitoringSource: delegate,
      alert: delegate,
      analysisResult: delegate,
    } as unknown as Prisma.TransactionClient;
    const tenant = { userId: "user-a", organizationId: "org-a" };

    for (const resource of names) {
      await listTenantResource(client, tenant, resource);
      await getTenantResource(client, tenant, resource, "record-b");
      await updateTenantResource(client, tenant, resource, "record-b", { name: "updated" });
      await deleteTenantResource(client, tenant, resource, "record-b");
    }

    expect(delegate.findMany).toHaveBeenCalledTimes(4);
    expect(delegate.findMany.mock.calls.map(([args]) => args.where)).toEqual(names.map(() => ({ organizationId: "org-a" })));
    expect(delegate.findFirst.mock.calls.map(([args]) => args.where)).toEqual(names.map(() => ({ id: "record-b", organizationId: "org-a" })));
    expect(delegate.updateMany.mock.calls.map(([args]) => args.where)).toEqual(names.map(() => ({ id: "record-b", organizationId: "org-a" })));
    expect(delegate.deleteMany.mock.calls.map(([args]) => args.where)).toEqual(names.map(() => ({ id: "record-b", organizationId: "org-a" })));
  });

  it("forces organization ownership on creates for every tenant-owned resource", async () => {
    const names = ["integrations", "monitoring-sources", "alerts", "analysis-results"] as const;
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const delegate = { create };
    const client = {
      ciCdIntegration: delegate,
      monitoringSource: delegate,
      alert: delegate,
      analysisResult: delegate,
    } as unknown as Prisma.TransactionClient;
    const tenant = { userId: "user-a", organizationId: "org-a" };

    for (const resource of names) {
      await createTenantResource(client, tenant, resource, { title: resource, organizationId: "org-b" });
    }

    expect(create).toHaveBeenCalledTimes(4);
    expect(create.mock.calls.map(([args]) => args.data.organizationId)).toEqual(names.map(() => "org-a"));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/access";
import { createIncident, IncidentAlertsNotFoundError, setIncidentStatus } from "./service";

const tenant: TenantContext = { userId: "user-a", organizationId: "org-a" };

function createClient() {
  return {
    alert: { findMany: vi.fn() },
    incident: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    incidentAlert: { createMany: vi.fn() },
  } as unknown as Prisma.TransactionClient;
}

describe("manual incident service", () => {
  let tx: ReturnType<typeof createClient>;

  beforeEach(() => {
    tx = createClient();
  });

  it("creates an incident and records each operator-supplied alert relationship reason", async () => {
    const item = { id: "incident-a", organizationId: tenant.organizationId, title: "API latency" };
    vi.mocked(tx.alert.findMany).mockResolvedValue([{ id: "alert-a" }, { id: "alert-b" }] as never);
    vi.mocked(tx.incident.create).mockResolvedValue({ id: item.id } as never);
    vi.mocked(tx.incidentAlert.createMany).mockResolvedValue({ count: 2 });
    vi.mocked(tx.incident.findFirst).mockResolvedValue(item as never);

    await expect(createIncident(tx, tenant, {
      title: "API latency",
      alerts: [
        { alertId: "alert-a", reason: "Same API service and confirmed impact window." },
        { alertId: "alert-b", reason: "Same API service and confirmed impact window." },
      ],
    })).resolves.toEqual(item);

    expect(tx.alert.findMany).toHaveBeenCalledWith({
      where: { organizationId: tenant.organizationId, id: { in: ["alert-a", "alert-b"] } },
      select: { id: true },
    });
    expect(tx.incident.create).toHaveBeenCalledWith({
      data: { organizationId: tenant.organizationId, title: "API latency", description: null, createdByUserId: tenant.userId },
    });
    expect(tx.incidentAlert.createMany).toHaveBeenCalledWith({ data: [
      { organizationId: tenant.organizationId, incidentId: item.id, alertId: "alert-a", linkedByUserId: tenant.userId, linkReason: "Same API service and confirmed impact window." },
      { organizationId: tenant.organizationId, incidentId: item.id, alertId: "alert-b", linkedByUserId: tenant.userId, linkReason: "Same API service and confirmed impact window." },
    ] });
  });

  it("fails closed before creating an incident when any alert is outside the tenant", async () => {
    vi.mocked(tx.alert.findMany).mockResolvedValue([{ id: "alert-a" }] as never);
    await expect(createIncident(tx, tenant, {
      title: "Cross-tenant attempt",
      alerts: [
        { alertId: "alert-a", reason: "Same service impact and operator reviewed." },
        { alertId: "alert-b", reason: "Same service impact and operator reviewed." },
      ],
    })).rejects.toBeInstanceOf(IncidentAlertsNotFoundError);
    expect(tx.incident.create).not.toHaveBeenCalled();
    expect(tx.incidentAlert.createMany).not.toHaveBeenCalled();
  });

  it("records resolver identity and clears resolution fields when reopened", async () => {
    vi.mocked(tx.incident.findFirst)
      .mockResolvedValueOnce({ id: "incident-a", status: "OPEN" } as never)
      .mockResolvedValueOnce({ id: "incident-a", status: "RESOLVED" } as never)
      .mockResolvedValueOnce({ id: "incident-a", status: "RESOLVED" } as never)
      .mockResolvedValueOnce({ id: "incident-a", status: "OPEN" } as never);
    vi.mocked(tx.incident.updateMany).mockResolvedValue({ count: 1 });

    await setIncidentStatus(tx, tenant, "incident-a", "RESOLVED");
    const resolvedUpdate = vi.mocked(tx.incident.updateMany).mock.calls[0]?.[0];
    expect(resolvedUpdate?.where).toEqual({ id: "incident-a", organizationId: tenant.organizationId });
    expect(resolvedUpdate?.data).toMatchObject({ status: "RESOLVED", resolvedByUserId: tenant.userId });
    expect(resolvedUpdate?.data?.resolvedAt).toBeInstanceOf(Date);

    await setIncidentStatus(tx, tenant, "incident-a", "OPEN");
    expect(vi.mocked(tx.incident.updateMany).mock.calls[1]?.[0]?.data).toEqual({
      status: "OPEN", resolvedAt: null, resolvedByUserId: null,
    });
  });
});

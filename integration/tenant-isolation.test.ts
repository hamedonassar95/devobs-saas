import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireTenantContext, withTenantTransaction, type TenantContext } from "@/lib/tenant/access";
import { createTenantResource, deleteTenantResource, getTenantResource, listTenantResource, updateTenantResource } from "@/lib/tenant/resources";

const suffix = randomUUID();
let organizationAId = "";
let organizationBId = "";
let userAId = "";
let userBId = "";
let tenantA: TenantContext;
let tenantB: TenantContext;
let alertAId = "";
let alertBId = "";
let integrationAId = "";
let integrationBId = "";
let monitoringSourceAId = "";
let monitoringSourceBId = "";
let analysisAId = "";
let analysisBId = "";

describe("PostgreSQL tenant isolation policies", () => {
  beforeAll(async () => {
    const orgA = await prisma.organization.create({ data: { name: `Tenant A ${suffix}`, slug: `tenant-a-${suffix}` } });
    const orgB = await prisma.organization.create({ data: { name: `Tenant B ${suffix}`, slug: `tenant-b-${suffix}` } });
    const userA = await prisma.user.create({ data: { email: `tenant-a-${suffix}@example.test` } });
    const userB = await prisma.user.create({ data: { email: `tenant-b-${suffix}@example.test` } });
    organizationAId = orgA.id;
    organizationBId = orgB.id;
    userAId = userA.id;
    userBId = userB.id;

    await prisma.membership.createMany({
      data: [
        { organizationId: orgA.id, userId: userA.id, role: "OWNER", status: "ACTIVE" },
        { organizationId: orgB.id, userId: userB.id, role: "OWNER", status: "ACTIVE" },
      ],
    });
    tenantA = await requireTenantContext(userA.id, orgA.id);
    tenantB = await requireTenantContext(userB.id, orgB.id);

    const integrationA = await withTenantTransaction(tenantA, (tx) => tx.ciCdIntegration.create({
      data: { organizationId: orgA.id, provider: "GITHUB", name: `integration-a-${suffix}`, repositoryUrl: `https://github.com/example/a-${suffix}` },
    }));
    const integrationB = await withTenantTransaction(tenantB, (tx) => tx.ciCdIntegration.create({
      data: { organizationId: orgB.id, provider: "GITHUB", name: `integration-b-${suffix}`, repositoryUrl: `https://github.com/example/b-${suffix}` },
    }));
    integrationAId = integrationA.id;
    integrationBId = integrationB.id;

    const sourceA = await withTenantTransaction(tenantA, (tx) => tx.monitoringSource.create({
      data: { organizationId: orgA.id, provider: "PROMETHEUS", name: `source-a-${suffix}` },
    }));
    const sourceB = await withTenantTransaction(tenantB, (tx) => tx.monitoringSource.create({
      data: { organizationId: orgB.id, provider: "PROMETHEUS", name: `source-b-${suffix}` },
    }));
    monitoringSourceAId = sourceA.id;
    monitoringSourceBId = sourceB.id;

    const alertA = await withTenantTransaction(tenantA, (tx) => tx.alert.create({
      data: { organizationId: orgA.id, sourceId: sourceA.id, title: `Alert A ${suffix}`, severity: "WARNING" },
    }));
    const alertB = await withTenantTransaction(tenantB, (tx) => tx.alert.create({
      data: { organizationId: orgB.id, sourceId: sourceB.id, title: `Alert B ${suffix}`, severity: "CRITICAL" },
    }));
    alertAId = alertA.id;
    alertBId = alertB.id;
    const analysisA = await withTenantTransaction(tenantA, (tx) => tx.analysisResult.create({
      data: { organizationId: orgA.id, alertId: alertA.id, summary: `Analysis A ${suffix}` },
    }));
    const analysisB = await withTenantTransaction(tenantB, (tx) => tx.analysisResult.create({
      data: { organizationId: orgB.id, alertId: alertB.id, summary: `Analysis B ${suffix}` },
    }));
    analysisAId = analysisA.id;
    analysisBId = analysisB.id;
  });

  afterAll(async () => {
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue;
      await withTenantTransaction(tenant, async (tx) => {
        await tx.analysisResult.deleteMany({ where: { organizationId: tenant.organizationId } });
        await tx.alert.deleteMany({ where: { organizationId: tenant.organizationId } });
        await tx.monitoringSource.deleteMany({ where: { organizationId: tenant.organizationId } });
        await tx.ciCdIntegration.deleteMany({ where: { organizationId: tenant.organizationId } });
      });
    }
    if (organizationAId || organizationBId) {
      await prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId].filter(Boolean) } } });
    }
    if (userAId || userBId) await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it("fails closed when tenant RLS context is absent", async () => {
    const alerts = await prisma.alert.findMany({ where: { organizationId: organizationAId } });
    expect(alerts).toEqual([]);
    await expect(prisma.alert.create({
      data: { organizationId: organizationAId, title: "Missing context", severity: "WARNING" },
    })).rejects.toThrow();
  });

  it("lists only records belonging to the active tenant context", async () => {
    const [alertsA, alertsB] = await Promise.all([
      withTenantTransaction(tenantA, (tx) => listTenantResource(tx, tenantA, "alerts")),
      withTenantTransaction(tenantB, (tx) => listTenantResource(tx, tenantB, "alerts")),
    ]);
    expect(alertsA.map((alert) => alert.id)).toEqual([alertAId]);
    expect(alertsB.map((alert) => alert.id)).toEqual([alertBId]);
  });

  it("blocks cross-tenant reads, updates, and deletes", async () => {
    const read = await withTenantTransaction(tenantA, (tx) => getTenantResource(tx, tenantA, "alerts", alertBId));
    const update = await withTenantTransaction(tenantA, (tx) => updateTenantResource(tx, tenantA, "alerts", alertBId, { title: "Cross-tenant overwrite" }));
    const deletion = await withTenantTransaction(tenantA, (tx) => deleteTenantResource(tx, tenantA, "alerts", alertBId));

    expect(read).toBeNull();
    expect(update.count).toBe(0);
    expect(deletion.count).toBe(0);
    const analysis = await withTenantTransaction(tenantA, (tx) => getTenantResource(tx, tenantA, "analysis-results", analysisBId));
    expect(analysis).toBeNull();
  });

  it("rejects writes that bypass the scoped repository and cross-tenant foreign keys", async () => {
    await expect(withTenantTransaction(tenantA, (tx) => tx.alert.create({
      data: { organizationId: organizationBId, title: "Forged tenant", severity: "WARNING" },
    }))).rejects.toThrow();

    await expect(withTenantTransaction(tenantA, (tx) => tx.alert.create({
      data: { organizationId: organizationAId, sourceId: monitoringSourceBId, title: "Foreign source", severity: "WARNING" },
    }))).rejects.toThrow();

    await expect(withTenantTransaction(tenantA, (tx) => tx.analysisResult.create({
      data: { organizationId: organizationAId, alertId: alertBId, summary: "Foreign alert analysis" },
    }))).rejects.toThrow();
  });

  it("scopes all resource reads and stamps creates with the authorized tenant", async () => {
    const resources = ["integrations", "monitoring-sources", "alerts", "analysis-results"] as const;
    const visibleIds = await Promise.all([tenantA, tenantB].map((tenant) => withTenantTransaction(tenant, async (tx) => {
      const ids = await Promise.all(resources.map(async (resource) => (await listTenantResource(tx, tenant, resource)).map((item) => item.id)));
      await createTenantResource(tx, tenant, "alerts", {
        title: `Tenant scoped create ${suffix}`,
        severity: "INFO",
        organizationId: tenant === tenantA ? organizationBId : organizationAId,
      });
      return ids;
    })));
    expect(visibleIds).toEqual([
      [[integrationAId], [monitoringSourceAId], [alertAId], [analysisAId]],
      [[integrationBId], [monitoringSourceBId], [alertBId], [analysisBId]],
    ]);
  });
});

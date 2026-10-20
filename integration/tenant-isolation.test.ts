import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireTenantContext, withTenantTransaction, type TenantContext } from "@/lib/tenant/access";
import { createTenantResource, deleteTenantResource, getTenantResource, listTenantResource, updateTenantResource } from "@/lib/tenant/resources";
import { PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { applyStripeSubscriptionSnapshot } from "@/lib/billing/stripe-events";

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
const stripeEventIds: string[] = [];

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
        await tx.subscription.deleteMany({ where: { organizationId: tenant.organizationId } });
      });
    }
    if (stripeEventIds.length) await prisma.processedStripeEvent.deleteMany({ where: { id: { in: stripeEventIds } } });
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

  it("scopes billing rows, enforces plan features, and applies signed-event snapshots idempotently", async () => {
    const trialStartedAt = new Date("2026-10-20T00:00:00.000Z");
    const trialEndsAt = new Date("2026-11-03T00:00:00.000Z");
    const firstEventId = `evt_trial_${suffix}`;
    const first = {
      eventId: firstEventId,
      eventType: "customer.subscription.created",
      eventCreatedAt: 1_000,
      organizationId: organizationAId,
      stripeCustomerId: `cus_a_${suffix}`,
      stripeSubscriptionId: `sub_a_${suffix}`,
      plan: "MONITORING" as const,
      status: "TRIALING" as const,
      trialStartedAt,
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
      cancelAtPeriodEnd: false,
    };
    stripeEventIds.push(firstEventId, `evt_stale_${suffix}`, `evt_schedule_cancel_${suffix}`, `evt_cancel_${suffix}`);
    expect(await applyStripeSubscriptionSnapshot(first)).toBe("applied");
    expect(await applyStripeSubscriptionSnapshot(first)).toBe("duplicate");

    const visible = await withTenantTransaction(tenantA, (tx) => tx.subscription.findMany({ where: { organizationId: organizationAId } }));
    expect(visible).toHaveLength(1);
    expect(await prisma.subscription.findMany({ where: { organizationId: organizationAId } })).toEqual([]);
    await expect(prisma.subscription.create({
      data: {
        organizationId: organizationAId,
        stripeSubscriptionId: `sub_no_context_${suffix}`,
        plan: "FULL",
        status: "ACTIVE",
      },
    })).rejects.toThrow();
    const secondTenantEventId = `evt_tenant_b_${suffix}`;
    stripeEventIds.push(secondTenantEventId);
    expect(await applyStripeSubscriptionSnapshot({
      ...first,
      eventId: secondTenantEventId,
      eventType: "customer.subscription.created",
      organizationId: organizationBId,
      stripeCustomerId: `cus_b_${suffix}`,
      stripeSubscriptionId: `sub_b_${suffix}`,
      plan: "FULL",
      status: "ACTIVE",
      trialStartedAt: null,
      trialEndsAt: null,
    })).toBe("applied");
    expect(await withTenantTransaction(tenantA, (tx) => tx.subscription.findMany({ where: { organizationId: organizationBId } }))).toEqual([]);
    expect(await withTenantTransaction(tenantB, (tx) => tx.subscription.findMany({ where: { organizationId: organizationBId } }))).toHaveLength(1);
    await expect(withTenantTransaction(tenantA, (tx) => requirePlanFeature(tx, organizationAId, "monitoring"))).resolves.toBeUndefined();
    await expect(withTenantTransaction(tenantA, (tx) => requirePlanFeature(tx, organizationAId, "cicd"))).rejects.toBeInstanceOf(PlanAccessError);

    expect(await applyStripeSubscriptionSnapshot({
      ...first,
      eventId: `evt_stale_${suffix}`,
      eventType: "customer.subscription.deleted",
      eventCreatedAt: 999,
      status: "CANCELED",
    })).toBe("stale");
    expect(await applyStripeSubscriptionSnapshot({
      ...first,
      eventId: `evt_schedule_cancel_${suffix}`,
      eventType: "customer.subscription.updated",
      eventCreatedAt: 1_001,
      status: "ACTIVE",
      trialStartedAt: null,
      trialEndsAt: null,
      cancelAtPeriodEnd: true,
    })).toBe("applied");
    await expect(withTenantTransaction(tenantA, (tx) => requirePlanFeature(tx, organizationAId, "monitoring"))).resolves.toBeUndefined();
    expect(await applyStripeSubscriptionSnapshot({
      ...first,
      eventId: `evt_cancel_${suffix}`,
      eventType: "customer.subscription.deleted",
      eventCreatedAt: 1_002,
      status: "CANCELED",
      trialStartedAt: null,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
    })).toBe("applied");
    await expect(withTenantTransaction(tenantA, (tx) => requirePlanFeature(tx, organizationAId, "monitoring"))).rejects.toBeInstanceOf(PlanAccessError);
  });
});

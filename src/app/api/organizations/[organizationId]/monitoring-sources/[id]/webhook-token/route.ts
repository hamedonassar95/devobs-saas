import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { createMonitoringWebhookToken, hashMonitoringWebhookToken } from "@/lib/monitoring/webhook-token";
import { requireTenantContextForPermission, TenantAccessError, TenantPermissionError, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string; id: string }> };

/** Rotate a monitoring bearer token. Only admins and owners may perform this operation. */
export async function POST(_request: Request, context: RouteContext) {
  const { organizationId, id: sourceId } = await context.params;
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "delete");
    const webhookToken = createMonitoringWebhookToken();
    const sourceExists = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource("monitoring-sources"));
      const source = await tx.monitoringSource.findFirst({
        where: { id: sourceId, organizationId, provider: { in: ["PROMETHEUS", "GRAFANA"] } },
        select: { id: true },
      });
      if (!source) return false;
      await tx.monitoringWebhookCredential.upsert({
        where: { organizationId_sourceId: { organizationId, sourceId } },
        create: { organizationId, sourceId, tokenHash: hashMonitoringWebhookToken(webhookToken) },
        update: { tokenHash: hashMonitoringWebhookToken(webhookToken) },
      });
      return true;
    });
    if (!sourceExists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const webhookPath = `/api/webhooks/monitoring/${encodeURIComponent(organizationId)}/${encodeURIComponent(sourceId)}`;
    return NextResponse.json({ webhookPath, webhookToken }, { status: 200 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

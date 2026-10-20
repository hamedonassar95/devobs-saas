import { NextResponse } from "next/server";
import { analyzeAlertWithLocalRules } from "@/lib/analysis/rules";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { TenantAccessError, TenantPermissionError, requireTenantContextForPermission, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { organizationId, id } = await context.params;
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "write");
    const result = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource("analysis-results"));
      const alert = await tx.alert.findFirst({ where: { id, organizationId: tenant.organizationId } });
      if (!alert) return null;
      const analysis = analyzeAlertWithLocalRules(alert);
      return tx.analysisResult.create({
        data: {
          organizationId: tenant.organizationId,
          alertId: alert.id,
          summary: analysis.summary,
          details: analysis.details,
          model: "local-rules-v1",
        },
      });
    });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: result }, { status: 201 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

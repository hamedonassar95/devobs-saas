import { NextResponse } from "next/server";
import { analyzeAlert } from "@/lib/analysis/service";
import { CLOUDFLARE_ANALYSIS_MODEL_ID, getCloudflareWorkersAiConfig } from "@/lib/analysis/cloudflare";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { TenantAccessError, TenantPermissionError, requireTenantContextForPermission, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { organizationId, id } = await context.params;
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "write");
    const prepared = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource("analysis-results"));
      const alert = await tx.alert.findFirst({ where: { id, organizationId: tenant.organizationId } });
      if (!alert) return null;
      const organization = await tx.organization.findUnique({
        where: { id: tenant.organizationId },
        select: { aiAnalysisEnabled: true },
      });
      if (!organization) return null;

      if (organization.aiAnalysisEnabled && getCloudflareWorkersAiConfig()) {
        const cached = await tx.analysisResult.findFirst({
          where: {
            organizationId: tenant.organizationId,
            alertId: alert.id,
            model: CLOUDFLARE_ANALYSIS_MODEL_ID,
            createdAt: { gte: alert.updatedAt },
          },
          orderBy: { createdAt: "desc" },
        });
        if (cached) return { alert, aiEnabled: true, cached };
      }
      return { alert, aiEnabled: organization.aiAnalysisEnabled, cached: null };
    });
    if (!prepared) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (prepared.cached) return NextResponse.json({ item: prepared.cached }, { status: 200 });

    const analysis = await analyzeAlert(prepared.alert, prepared.aiEnabled);
    const { model } = analysis;

    const currentTenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "write");
    const result = await withTenantTransaction(currentTenant, async (tx) => {
      await requirePlanFeature(tx, currentTenant.organizationId, featureForResource("analysis-results"));
      const currentAlert = await tx.alert.findFirst({
        where: { id, organizationId: currentTenant.organizationId },
        select: { id: true, updatedAt: true },
      });
      if (!currentAlert) return null;
      if (currentAlert.updatedAt.getTime() !== prepared.alert.updatedAt.getTime()) return "alert-changed" as const;
      if (model === CLOUDFLARE_ANALYSIS_MODEL_ID) {
        const organization = await tx.organization.findUnique({
          where: { id: currentTenant.organizationId },
          select: { aiAnalysisEnabled: true },
        });
        if (!organization?.aiAnalysisEnabled || !getCloudflareWorkersAiConfig()) return "ai-disabled" as const;
        const cached = await tx.analysisResult.findFirst({
          where: {
            organizationId: currentTenant.organizationId,
            alertId: currentAlert.id,
            model: CLOUDFLARE_ANALYSIS_MODEL_ID,
            createdAt: { gte: currentAlert.updatedAt },
          },
          orderBy: { createdAt: "desc" },
        });
        if (cached) return cached;
      }
      return tx.analysisResult.create({
        data: {
          organizationId: currentTenant.organizationId,
          alertId: currentAlert.id,
          summary: analysis.summary,
          details: analysis.details,
          model,
        },
      });
    });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result === "alert-changed") return NextResponse.json({ error: "Alert changed during analysis; retry with the latest alert state." }, { status: 409 });
    if (result === "ai-disabled") return NextResponse.json({ error: "AI opt-in was disabled before the result could be saved." }, { status: 409 });
    return NextResponse.json({ item: result }, { status: 201 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

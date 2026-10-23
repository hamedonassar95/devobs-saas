import { NextResponse } from "next/server";
import { analyzeAlert } from "@/lib/analysis/service";
import { CLOUDFLARE_ANALYSIS_MODEL_ID, getCloudflareWorkersAiConfig } from "@/lib/analysis/cloudflare";
import { getDailyAiRequestLimit, getPlatformDailyAiRequestLimit, getUtcDayStart, recordAiAnalysisOutcome, reserveAiAnalysisRequest } from "@/lib/analysis/usage";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { normalizeAlertOnlyAnalysis } from "@/lib/analysis/presentation";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { TenantAccessError, TenantPermissionError, requireTenantContextForPermission, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string; id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { organizationId, id } = await context.params;
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "write");
    const usageDay = getUtcDayStart();
    const aiConfig = getCloudflareWorkersAiConfig();
    const dailyLimit = getDailyAiRequestLimit();
    const platformDailyLimit = getPlatformDailyAiRequestLimit();
    const prepared = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource("analysis-results"));
      const alert = await tx.alert.findFirst({
        where: { id, organizationId: tenant.organizationId },
        include: { source: { select: { provider: true } } },
      });
      if (!alert) return null;
      const organization = await tx.organization.findUnique({
        where: { id: tenant.organizationId },
        select: { aiAnalysisEnabled: true },
      });
      if (!organization) return null;

      const result = {
        alert,
        aiEnabled: organization.aiAnalysisEnabled,
        cached: null as Awaited<ReturnType<typeof tx.analysisResult.findFirst>>,
        dailyLimitReached: false,
        usageReserved: false,
      };

      if (organization.aiAnalysisEnabled && aiConfig) {
        const cached = await tx.analysisResult.findFirst({
          where: {
            organizationId: tenant.organizationId,
            alertId: alert.id,
            model: CLOUDFLARE_ANALYSIS_MODEL_ID,
            createdAt: { gte: alert.updatedAt },
          },
          orderBy: { createdAt: "desc" },
        });
        if (cached) return { ...result, cached };

        const reservation = await reserveAiAnalysisRequest(
          tx,
          tenant.organizationId,
          usageDay,
          dailyLimit ?? 0,
          platformDailyLimit ?? 0,
        );
        if (reservation === null) return { ...result, aiEnabled: false, dailyLimitReached: true };
        return { ...result, usageReserved: true };
      }
      return result;
    });
    if (!prepared) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (prepared.cached) return NextResponse.json({ item: normalizeAlertOnlyAnalysis(prepared.cached) }, { status: 200 });

    let analysis = await analyzeAlert({
      title: prepared.alert.title,
      description: prepared.alert.description,
      severity: prepared.alert.severity,
      status: prepared.alert.status,
      sourceProvider: prepared.alert.source?.provider === "PROMETHEUS" || prepared.alert.source?.provider === "GRAFANA"
        ? prepared.alert.source.provider
        : null,
    }, prepared.aiEnabled);
    if (prepared.dailyLimitReached) {
      analysis = {
        ...analysis,
        model: "local-rules-daily-limit",
        details: {
          ...analysis.details,
          note: `The organization's daily or shared application Cloudflare Workers AI request limit was reached. Local deterministic guidance was returned; no provider request was made.`,
        },
      };
    }
    const { model } = analysis;

    const currentTenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "write");
    const result = await withTenantTransaction(currentTenant, async (tx) => {
      if (prepared.usageReserved && analysis.providerCall.attempted) {
        await recordAiAnalysisOutcome(
          tx,
          currentTenant.organizationId,
          usageDay,
          analysis.providerCall.outcome === "succeeded" ? "succeeded" : "failed",
          analysis.providerCall.durationMs,
          analysis.providerCall.tokenUsage,
        );
      }
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

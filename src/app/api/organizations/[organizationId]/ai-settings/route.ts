import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { CLOUDFLARE_ANALYSIS_MODEL_ID, isCloudflareWorkersAiConfigured, isCloudflareWorkersAiFreePlanConfirmed } from "@/lib/analysis/cloudflare";
import { CLOUDFLARE_AI_PRICING_CHECKED_ON, getDailyAiRequestLimit, getPlatformDailyAiRequestLimit, getUtcDayStart, summarizeAiCostEstimate } from "@/lib/analysis/usage";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { TenantAccessError, TenantPermissionError, requireTenantContextForPermission, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string }> };
const settingSchema = z.object({ enabled: z.boolean() }).strict();

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "read");
    const usageDay = getUtcDayStart();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const { setting, usage, monthUsage } = await withTenantTransaction(tenant, async (tx) => {
      const setting = await tx.organization.findUnique({
        where: { id: tenant.organizationId },
        select: { aiAnalysisEnabled: true },
      });
      const usage = await tx.aiAnalysisUsageDaily.findUnique({
        where: { organizationId_day: { organizationId: tenant.organizationId, day: usageDay } },
      });
      const monthUsage = await tx.aiAnalysisUsageDaily.aggregate({
        where: { organizationId: tenant.organizationId, day: { gte: monthStart, lt: nextMonthStart } },
        _sum: {
          requests: true,
          succeeded: true,
          failed: true,
          totalLatencyMs: true,
          inputTokens: true,
          outputTokens: true,
          usageReports: true,
          estimatedCostNanoUsd: true,
        },
      });
      return { setting, usage, monthUsage: monthUsage._sum };
    });
    if (!setting) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const outcomes = (usage?.succeeded ?? 0) + (usage?.failed ?? 0);
    const monthlyOutcomes = (monthUsage.succeeded ?? 0) + (monthUsage.failed ?? 0);
    const dailyCost = summarizeAiCostEstimate(
      usage?.requests ?? 0,
      usage?.usageReports ?? 0,
      usage?.estimatedCostNanoUsd ?? BigInt(0),
    );
    const monthlyCost = summarizeAiCostEstimate(
      monthUsage.requests ?? 0,
      monthUsage.usageReports ?? 0,
      monthUsage.estimatedCostNanoUsd ?? BigInt(0),
    );
    return NextResponse.json({
      enabled: setting.aiAnalysisEnabled,
      providerAvailable: isCloudflareWorkersAiConfigured(),
      provider: "Cloudflare Workers AI",
      freePlanConfirmed: isCloudflareWorkersAiFreePlanConfirmed(),
      dailyRequestLimitPerOrganization: getDailyAiRequestLimit() ?? 0,
      sharedDailyRequestLimit: getPlatformDailyAiRequestLimit() ?? 0,
      usageToday: {
        requestsReserved: usage?.requests ?? 0,
        succeeded: usage?.succeeded ?? 0,
        failed: usage?.failed ?? 0,
        outcomesPending: Math.max(0, (usage?.requests ?? 0) - outcomes),
        averageLatencyMs: outcomes ? Math.round((usage?.totalLatencyMs ?? 0) / outcomes) : null,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        usageReports: usage?.usageReports ?? 0,
        ...dailyCost,
        costEstimateNote: "Estimated from Cloudflare's published model token rates before any account free allocation; provider billing dashboard is authoritative.",
        pricingCheckedOn: CLOUDFLARE_AI_PRICING_CHECKED_ON,
        window: "UTC day",
      },
      usageThisMonth: {
        task: "alert-triage",
        provider: "Cloudflare Workers AI",
        model: CLOUDFLARE_ANALYSIS_MODEL_ID,
        requestsReserved: monthUsage.requests ?? 0,
        succeeded: monthUsage.succeeded ?? 0,
        failed: monthUsage.failed ?? 0,
        outcomesPending: Math.max(0, (monthUsage.requests ?? 0) - monthlyOutcomes),
        averageLatencyMs: monthlyOutcomes ? Math.round((monthUsage.totalLatencyMs ?? 0) / monthlyOutcomes) : null,
        inputTokens: monthUsage.inputTokens ?? 0,
        outputTokens: monthUsage.outputTokens ?? 0,
        usageReports: monthUsage.usageReports ?? 0,
        ...monthlyCost,
        costEstimateNote: "Estimated from Cloudflare's model token rates when usage is available for every reserved request; provider billing dashboard is authoritative.",
        pricingCheckedOn: CLOUDFLARE_AI_PRICING_CHECKED_ON,
        window: "UTC calendar month",
      },
      dataHandling: "When enabled, redacted alert text and normalized severity, status, and source type are sent to Cloudflare Workers AI for analysis.",
    });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  const parsed = settingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid AI setting." }, { status: 400 });
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "admin");
    if (parsed.data.enabled && !isCloudflareWorkersAiConfigured()) {
      return NextResponse.json({ error: "AI provider is not configured by the application operator." }, { status: 503 });
    }
    const setting = await withTenantTransaction(tenant, async (tx) => {
      if (parsed.data.enabled) {
        await requirePlanFeature(tx, tenant.organizationId, featureForResource("analysis-results"));
      }
      return tx.organization.update({
        where: { id: tenant.organizationId },
        data: { aiAnalysisEnabled: parsed.data.enabled },
        select: { aiAnalysisEnabled: true },
      });
    });
    return NextResponse.json({ enabled: setting.aiAnalysisEnabled });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

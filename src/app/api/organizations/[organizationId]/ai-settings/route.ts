import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { isCloudflareWorkersAiConfigured, isCloudflareWorkersAiFreePlanConfirmed } from "@/lib/analysis/cloudflare";
import { getDailyAiRequestLimit, getUtcDayStart } from "@/lib/analysis/usage";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { TenantAccessError, TenantPermissionError, requireTenantContextForPermission, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string }> };
const settingSchema = z.object({ enabled: z.boolean() }).strict();

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "read");
    const usageDay = getUtcDayStart();
    const { setting, usage } = await withTenantTransaction(tenant, async (tx) => {
      const setting = await tx.organization.findUnique({
        where: { id: tenant.organizationId },
        select: { aiAnalysisEnabled: true },
      });
      const usage = await tx.aiAnalysisUsageDaily.findUnique({
        where: { organizationId_day: { organizationId: tenant.organizationId, day: usageDay } },
      });
      return { setting, usage };
    });
    if (!setting) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const outcomes = (usage?.succeeded ?? 0) + (usage?.failed ?? 0);
    return NextResponse.json({
      enabled: setting.aiAnalysisEnabled,
      providerAvailable: isCloudflareWorkersAiConfigured(),
      provider: "Cloudflare Workers AI",
      freePlanConfirmed: isCloudflareWorkersAiFreePlanConfirmed(),
      dailyRequestLimitPerOrganization: getDailyAiRequestLimit() ?? 0,
      usageToday: {
        requestsReserved: usage?.requests ?? 0,
        succeeded: usage?.succeeded ?? 0,
        failed: usage?.failed ?? 0,
        outcomesPending: Math.max(0, (usage?.requests ?? 0) - outcomes),
        averageLatencyMs: outcomes ? Math.round((usage?.totalLatencyMs ?? 0) / outcomes) : null,
        window: "UTC day",
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

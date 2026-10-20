import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { isCloudflareWorkersAiConfigured } from "@/lib/analysis/cloudflare";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { TenantAccessError, TenantPermissionError, requireTenantContextForPermission, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string }> };
const settingSchema = z.object({ enabled: z.boolean() }).strict();

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "read");
    const setting = await withTenantTransaction(tenant, async (tx) => tx.organization.findUnique({
      where: { id: tenant.organizationId },
      select: { aiAnalysisEnabled: true },
    }));
    if (!setting) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    return NextResponse.json({
      enabled: setting.aiAnalysisEnabled,
      providerAvailable: isCloudflareWorkersAiConfigured(),
      provider: "Cloudflare Workers AI",
      dataHandling: "When enabled, redacted alert titles and descriptions are sent to Cloudflare Workers AI for analysis.",
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

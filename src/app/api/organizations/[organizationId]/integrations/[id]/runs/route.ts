import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { requireTenantContext, TenantAccessError, withTenantTransaction } from "@/lib/tenant/access";
import { ProviderRequestError, listPipelineRuns } from "@/lib/providers/cicd";

type RouteContext = { params: Promise<{ organizationId: string; id: string }> };

/** Read-only pipeline history. This route never dispatches, retries, or cancels a provider workflow. */
export async function GET(request: Request, context: RouteContext) {
  const { organizationId, id } = await context.params;
  try {
    const tenant = await requireTenantContext(await getAuthenticatedUserId(), organizationId);
    const integration = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource("integrations"));
      return tx.ciCdIntegration.findFirst({
        where: { id, organizationId: tenant.organizationId, status: "ACTIVE" },
        select: { id: true, provider: true, repositoryUrl: true },
      });
    });
    if (!integration) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const runs = await listPipelineRuns(integration, request.headers.get("x-cicd-provider-token"));
    return NextResponse.json({ runs });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    if (error instanceof ProviderRequestError) {
      const status = error.status === 400 ? 400 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}

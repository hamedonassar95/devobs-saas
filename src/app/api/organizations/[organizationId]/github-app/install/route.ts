import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { getGitHubAppConfig, createInstallState } from "@/lib/github/app";
import { requireTenantContextForPermission, TenantAccessError, TenantPermissionError, withTenantTransaction } from "@/lib/tenant/access";

const STATE_COOKIE = "devobs_github_install_state";
const STATE_TTL_MS = 10 * 60_000;
type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = getGitHubAppConfig();
  if (!config) return NextResponse.json({ error: "GitHub App setup is not available." }, { status: 503 });

  try {
    const tenant = await requireTenantContextForPermission(userId, organizationId, "admin");
    const state = createInstallState(config, {
      organizationId: tenant.organizationId,
      userId,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource("integrations"));
    });

    const installUrl = new URL(`https://github.com/apps/${config.appSlug}/installations/new`);
    installUrl.searchParams.set("state", state);
    const response = NextResponse.redirect(installUrl, 303);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/api/github-app/callback",
      maxAge: STATE_TTL_MS / 1000,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    return NextResponse.json({ error: "GitHub App setup could not be started." }, { status: 500 });
  }
}

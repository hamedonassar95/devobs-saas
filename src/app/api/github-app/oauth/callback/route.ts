import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { GitHubAppError, authorizeUserForInstallation, getGitHubAppConfig, getInstallationMetadata, verifyInstallState } from "@/lib/github/app";
import { requireTenantContextForPermission, withTenantTransaction } from "@/lib/tenant/access";

const OAUTH_STATE_COOKIE = "devobs_github_oauth_state";

function dashboardRedirect(_request: Request, result: string, organizationId?: string): NextResponse {
  const query = new URLSearchParams({ github: result });
  if (organizationId) query.set("organization", organizationId);
  const response = new NextResponse(null, { status: 303, headers: { Location: "/dashboard/devobs?" + query.toString() } });
  response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/api/github-app/oauth/callback", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const signedState = url.searchParams.get("state");
  const cookieState = (await cookies()).get(OAUTH_STATE_COOKIE)?.value;
  const config = getGitHubAppConfig();
  if (!config || !signedState || !cookieState || signedState !== cookieState) return dashboardRedirect(request, "invalid-state");
  const state = verifyInstallState(config, signedState);
  if (!state?.installationId) return dashboardRedirect(request, "invalid-state");
  const installationId = state.installationId;

  const userId = await getAuthenticatedUserId();
  if (!userId || userId !== state.userId) return dashboardRedirect(request, "sign-in-again", state.organizationId);
  const code = url.searchParams.get("code");
  if (!code) return dashboardRedirect(request, url.searchParams.has("error") ? "cancelled" : "authorization-failed", state.organizationId);

  try {
    const authorizedInstallation = await authorizeUserForInstallation(config, code, installationId);
    const appInstallation = await getInstallationMetadata(config, installationId);
    if (authorizedInstallation.accountLogin.toLowerCase() !== appInstallation.accountLogin.toLowerCase()) {
      return dashboardRedirect(request, "installation-mismatch", state.organizationId);
    }
    const tenant = await requireTenantContextForPermission(userId, state.organizationId, "admin");
    await withTenantTransaction(tenant, async (tx) => tx.gitHubAppInstallation.upsert({
      where: { organizationId: tenant.organizationId },
      create: {
        organizationId: tenant.organizationId,
        installationId,
        accountLogin: appInstallation.accountLogin,
        workflowsWriteEnabled: appInstallation.workflowsWriteEnabled,
        connectedByUserId: userId,
      },
      update: {
        installationId,
        accountLogin: appInstallation.accountLogin,
        workflowsWriteEnabled: appInstallation.workflowsWriteEnabled,
        connectedByUserId: userId,
      },
    }));
    return dashboardRedirect(request, "connected", tenant.organizationId);
  } catch (error) {
    if (error instanceof GitHubAppError && error.status === 400) {
      return dashboardRedirect(request, "permissions-required", state.organizationId);
    }
    if (error instanceof GitHubAppError && error.status === 403) {
      return dashboardRedirect(request, "installation-not-authorized", state.organizationId);
    }
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return dashboardRedirect(request, "installation-in-use", state.organizationId);
    }
    return dashboardRedirect(request, "failed", state.organizationId);
  }
}

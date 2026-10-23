import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { createInstallState, getGitHubAppConfig, verifyInstallState } from "@/lib/github/app";

const STATE_COOKIE = "devobs_github_install_state";
const OAUTH_STATE_COOKIE = "devobs_github_oauth_state";
const STATE_TTL_MS = 10 * 60_000;

function dashboardRedirect(_request: Request, result: string, organizationId?: string): NextResponse {
  const query = new URLSearchParams({ github: result });
  if (organizationId) query.set("organization", organizationId);
  const response = new NextResponse(null, { status: 303, headers: { Location: "/dashboard/devobs?" + query.toString() } });
  response.cookies.set(STATE_COOKIE, "", { path: "/api/github-app/callback", maxAge: 0 });
  response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/api/github-app/oauth/callback", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const signedState = url.searchParams.get("state");
  const cookieState = (await cookies()).get(STATE_COOKIE)?.value;
  const config = getGitHubAppConfig();
  if (!config || !signedState || !cookieState || signedState !== cookieState) return dashboardRedirect(request, "invalid-state");
  const state = verifyInstallState(config, signedState);
  if (!state) return dashboardRedirect(request, "invalid-state");

  const userId = await getAuthenticatedUserId();
  if (!userId || userId !== state.userId) return dashboardRedirect(request, "sign-in-again", state.organizationId);
  if (!new Set(["install", "update"]).has(url.searchParams.get("setup_action") ?? "")) return dashboardRedirect(request, "cancelled", state.organizationId);

  const installationId = url.searchParams.get("installation_id") ?? "";
  if (!/^\d{1,20}$/.test(installationId)) return dashboardRedirect(request, "invalid-installation", state.organizationId);
  const oauthState = createInstallState(config, {
    organizationId: state.organizationId,
    userId,
    expiresAt: Date.now() + STATE_TTL_MS,
    installationId,
  });
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("state", oauthState);

  const response = NextResponse.redirect(authorizeUrl, 303);
  response.cookies.set(STATE_COOKIE, "", { path: "/api/github-app/callback", maxAge: 0 });
  response.cookies.set(OAUTH_STATE_COOKIE, oauthState, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/github-app/oauth/callback",
    maxAge: STATE_TTL_MS / 1000,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

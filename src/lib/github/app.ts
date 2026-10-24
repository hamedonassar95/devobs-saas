import { createHmac, randomBytes, sign as signJwt, timingSafeEqual } from "node:crypto";
import { readBoundedResponseJson } from "@/lib/http/bounded-json";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 10_000;

export class GitHubAppError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "GitHubAppError";
  }
}

export type GitHubAppConfig = Readonly<{
  appId: string;
  appSlug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  stateSecret: string;
}>;

export type InstallState = Readonly<{
  organizationId: string;
  userId: string;
  expiresAt: number;
  nonce: string;
  installationId?: string;
}>;

export type RepositoryRef = Readonly<{ owner: string; name: string; fullName: string }>;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function getGitHubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig | null {
  const appId = env.GITHUB_APP_ID?.trim() ?? "";
  const appSlug = env.GITHUB_APP_SLUG?.trim() ?? "";
  const clientId = env.GITHUB_APP_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GITHUB_APP_CLIENT_SECRET?.trim() ?? "";
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "";
  const stateSecret = env.GITHUB_APP_STATE_SECRET?.trim() ?? "";
  if (!/^\d{1,20}$/.test(appId) || !/^[a-zA-Z0-9-]{1,100}$/.test(appSlug)
    || !/^[A-Za-z0-9._-]{8,100}$/.test(clientId) || clientSecret.length < 20 || clientSecret.length > 500
    || !privateKey.includes("PRIVATE KEY") || stateSecret.length < 32) {
    return null;
  }
  return { appId, appSlug, clientId, clientSecret, privateKey, stateSecret };
}

export function parseGitHubRepositoryUrl(value: string): RepositoryRef {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GitHubAppError("Repository URL is invalid.", 400);
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) {
    throw new GitHubAppError("Only a plain HTTPS GitHub repository URL is supported.", 400);
  }
  const parts = url.pathname.split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { throw new GitHubAppError("Repository URL is invalid.", 400); }
  });
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]{1,100}$/.test(part) || part === "." || part === "..")) {
    throw new GitHubAppError("Repository URL must identify one GitHub repository.", 400);
  }
  const name = parts[1].replace(/\.git$/i, "");
  if (!name) throw new GitHubAppError("Repository URL must identify one GitHub repository.", 400);
  return { owner: parts[0], name, fullName: `${parts[0]}/${name}` };
}

export function createAppJwt(config: GitHubAppConfig, nowMs = Date.now()): string {
  const nowSeconds = Math.floor(nowMs / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: nowSeconds - 30, exp: nowSeconds + 8 * 60, iss: config.appId }));
  const signingInput = `${header}.${payload}`;
  let signature: Buffer;
  try {
    signature = signJwt("RSA-SHA256", Buffer.from(signingInput), config.privateKey);
  } catch {
    throw new GitHubAppError("GitHub App signing configuration is invalid.", 503);
  }
  return `${signingInput}.${base64Url(signature)}`;
}

export function createInstallState(config: GitHubAppConfig, input: Omit<InstallState, "nonce">): string {
  const state: InstallState = { ...input, nonce: randomBytes(24).toString("base64url") };
  const encoded = base64Url(JSON.stringify(state));
  const signature = createHmac("sha256", config.stateSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyInstallState(config: GitHubAppConfig, signedState: string, nowMs = Date.now()): InstallState | null {
  if (signedState.length > 4096) return null;
  const [encoded, signature, extra] = signedState.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", config.stateSecret).update(encoded).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = asRecord(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (!payload || typeof payload.organizationId !== "string" || typeof payload.userId !== "string" || typeof payload.nonce !== "string" || typeof payload.expiresAt !== "number") return null;
    if (payload.installationId !== undefined && (typeof payload.installationId !== "string" || !/^\d{1,20}$/.test(payload.installationId))) return null;
    if (!payload.organizationId || !payload.userId || payload.nonce.length < 20 || payload.expiresAt <= nowMs || payload.expiresAt > nowMs + 15 * 60_000) return null;
    return payload as InstallState;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await readBoundedResponseJson(response, MAX_RESPONSE_BYTES);
  } catch {
    throw new GitHubAppError("GitHub returned an invalid or oversized response.");
  }
}

async function githubRequest(path: string, token: string, method = "GET", body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GitHubAppError("GitHub could not be reached.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const status = response.status === 401 || response.status === 403 ? 502 : response.status === 404 ? 404 : 502;
    throw new GitHubAppError(status === 404 ? "GitHub resource was not found or is not accessible to this installation." : "GitHub rejected the repository request.", status);
  }
  return readJson(response);
}

export async function getInstallationMetadata(config: GitHubAppConfig, installationId: string) {
  if (!/^\d{1,20}$/.test(installationId)) throw new GitHubAppError("GitHub installation ID is invalid.", 400);
  const payload = asRecord(await githubRequest(`/app/installations/${installationId}`, createAppJwt(config)));
  const account = asRecord(payload?.account);
  const permissions = asRecord(payload?.permissions);
  const returnedId = typeof payload?.id === "number" ? String(payload.id) : payload?.id;
  const login = typeof account?.login === "string" ? account.login : null;
  if (returnedId !== installationId || !login) {
    throw new GitHubAppError("GitHub installation could not be verified.");
  }
  if (permissions?.contents !== "write" || permissions?.pull_requests !== "write") {
    throw new GitHubAppError("Install the GitHub App with Contents and Pull requests write permissions.", 400);
  }
  return { accountLogin: login, workflowsWriteEnabled: permissions.workflows === "write" };
}

export async function authorizeUserForInstallation(config: GitHubAppConfig, code: string, installationId: string) {
  if (!code || code.length > 4096 || !/^\d{1,20}$/.test(installationId)) {
    throw new GitHubAppError("GitHub authorization is invalid.", 400);
  }
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GitHubAppError("GitHub authorization could not be verified.");
  }
  if (!tokenResponse.ok) {
    await tokenResponse.body?.cancel().catch(() => undefined);
    throw new GitHubAppError("GitHub authorization could not be verified.");
  }
  const tokenPayload = asRecord(await readJson(tokenResponse));
  const userToken = tokenPayload?.access_token;
  if (typeof userToken !== "string" || userToken.length < 20 || userToken.length > 4096) {
    throw new GitHubAppError("GitHub authorization could not be verified.");
  }

  const installation = asRecord(await githubRequest("/user/installations/" + installationId, userToken));
  const account = asRecord(installation?.account);
  const permissions = asRecord(installation?.permissions);
  const returnedId = typeof installation?.id === "number" ? String(installation.id) : installation?.id;
  const login = typeof account?.login === "string" ? account.login : null;
  if (returnedId !== installationId || !login || permissions?.contents !== "write" || permissions?.pull_requests !== "write") {
    throw new GitHubAppError("Authorize GitHub access to this installation with Contents and Pull requests permissions.", 403);
  }
  return { accountLogin: login };
}

export async function createInstallationToken(config: GitHubAppConfig, installationId: string, write = false, workflowsWrite = false): Promise<string> {
  if (!/^\d{1,20}$/.test(installationId)) throw new GitHubAppError("GitHub installation ID is invalid.", 400);
  const payload = asRecord(await githubRequest(
    `/app/installations/${installationId}/access_tokens`,
    createAppJwt(config),
    "POST",
    { permissions: {
      contents: write ? "write" : "read",
      pull_requests: write ? "write" : "read",
      ...(workflowsWrite ? { workflows: "write" } : {}),
    } },
  ));
  const token = payload?.token;
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) throw new GitHubAppError("GitHub did not issue an installation token.");
  return token;
}

export async function githubApiRequest(token: string, path: string, method = "GET", body?: unknown): Promise<unknown> {
  if (!path.startsWith("/repos/") || path.includes("..") || token.length < 20 || token.length > 4096) throw new GitHubAppError("GitHub repository request is invalid.", 400);
  return githubRequest(path, token, method, body);
}

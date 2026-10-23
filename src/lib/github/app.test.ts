import { generateKeyPairSync, verify as verifySignature } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeUserForInstallation, createAppJwt, createInstallationToken, createInstallState, getGitHubAppConfig, getInstallationMetadata, parseGitHubRepositoryUrl, verifyInstallState, type GitHubAppConfig } from "./app";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config: GitHubAppConfig = {
  appId: "12345",
  appSlug: "devobs-repair",
  clientId: "Iv1.testclientid123",
  clientSecret: "test-only-client-secret-long-enough",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  stateSecret: "test-only-state-secret-with-more-than-thirty-two-bytes",
};

afterEach(() => vi.unstubAllGlobals());

describe("GitHub App security helpers", () => {
  it("creates a short-lived RS256 app JWT without exposing the key", () => {
    const token = createAppJwt(config, 1_800_000_000_000);
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString("utf8"))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toMatchObject({ iss: "12345", exp: 1_800_000_480 });
    expect(verifySignature("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    expect(token).not.toContain(config.privateKey);
  });

  it("requires all server-only app settings and a strong state secret", () => {
    expect(getGitHubAppConfig({ NODE_ENV: "test", GITHUB_APP_ID: "1", GITHUB_APP_SLUG: "devobs", GITHUB_APP_CLIENT_ID: config.clientId, GITHUB_APP_CLIENT_SECRET: config.clientSecret, GITHUB_APP_PRIVATE_KEY: "private key", GITHUB_APP_STATE_SECRET: "short" })).toBeNull();
    expect(getGitHubAppConfig({ NODE_ENV: "test", GITHUB_APP_ID: "1", GITHUB_APP_SLUG: "devobs", GITHUB_APP_CLIENT_ID: config.clientId, GITHUB_APP_CLIENT_SECRET: config.clientSecret, GITHUB_APP_PRIVATE_KEY: config.privateKey, GITHUB_APP_STATE_SECRET: config.stateSecret })).toMatchObject({ appId: "1", appSlug: "devobs", clientId: config.clientId });
  });

  it("signs expiring install state and rejects tampered or expired state", () => {
    const state = createInstallState(config, { organizationId: "org-1", userId: "user-1", expiresAt: 1_800_000_600_000 });
    expect(verifyInstallState(config, state, 1_800_000_000_000)).toMatchObject({ organizationId: "org-1", userId: "user-1" });
    expect(verifyInstallState(config, `${state}x`, 1_800_000_000_000)).toBeNull();
    expect(verifyInstallState(config, state, 1_800_000_700_000)).toBeNull();
  });

  it("accepts only a canonical GitHub repository URL", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/acme/platform.git")).toEqual({ owner: "acme", name: "platform", fullName: "acme/platform" });
    for (const value of ["http://github.com/acme/platform", "https://github.com.evil.test/acme/platform", "https://user@github.com/acme/platform", "https://github.com/acme/platform?x=1", "https://github.com/acme/platform/tree/main"]) {
      expect(() => parseGitHubRepositoryUrl(value)).toThrow();
    }
  });

  it("accepts the selected app permissions while detecting optional workflow write access", async () => {
    const responses = [
      { id: 98765, account: { login: "acme" }, permissions: { contents: "write", pull_requests: "write" } },
      { id: 98765, account: { login: "acme" }, permissions: { contents: "write", pull_requests: "write", workflows: "write" } },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 })));

    await expect(getInstallationMetadata(config, "98765")).resolves.toEqual({ accountLogin: "acme", workflowsWriteEnabled: false });
    await expect(getInstallationMetadata(config, "98765")).resolves.toEqual({ accountLogin: "acme", workflowsWriteEnabled: true });
  });

  it("links only an installation the authorizing GitHub user can access", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(url);
      requests.push({ url: requestUrl, init });
      if (requestUrl === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "fake-user-token-for-unit-tests-123456" }), { status: 200 });
      }
      if (requestUrl === "https://api.github.com/user/installations/98765") {
        return new Response(JSON.stringify({ id: 98765, account: { login: "acme" }, permissions: { contents: "write", pull_requests: "write" } }), { status: 200 });
      }
      throw new Error("Unexpected request");
    }));

    await expect(authorizeUserForInstallation(config, "oauth-code", "98765")).resolves.toEqual({ accountLogin: "acme" });
    expect(requests).toHaveLength(2);
    expect(requests[1].init?.headers).toMatchObject({ Authorization: "Bearer fake-user-token-for-unit-tests-123456" });
    expect(String(requests[0].init?.body)).toContain(config.clientSecret);
  });

  it("rejects installations the authorizing GitHub user cannot access", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "fake-user-token-for-unit-tests-123456" }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }));

    await expect(authorizeUserForInstallation(config, "oauth-code", "98765")).rejects.toThrow("GitHub resource was not found");
  });

  it("rejects GitHub installation metadata for a different installation ID", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: 98766,
      account: { login: "acme" },
      permissions: { contents: "write", pull_requests: "write" },
    }), { status: 200 })));

    await expect(getInstallationMetadata(config, "98765")).rejects.toThrow("could not be verified");
  });

  it("requests read-only installation permissions for audits and write permissions only for repairs", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ token: "fake-installation-token-for-unit-tests-123456" }), { status: 201 });
    }));

    await createInstallationToken(config, "98765");
    await createInstallationToken(config, "98765", true);
    await createInstallationToken(config, "98765", true, true);
    const readPermissions = JSON.parse(String(requests[0].init?.body)).permissions;
    const writePermissions = JSON.parse(String(requests[1].init?.body)).permissions;
    const workflowPermissions = JSON.parse(String(requests[2].init?.body)).permissions;
    expect(readPermissions).toEqual({ contents: "read", pull_requests: "read" });
    expect(writePermissions).toEqual({ contents: "write", pull_requests: "write" });
    expect(workflowPermissions).toEqual({ contents: "write", pull_requests: "write", workflows: "write" });
    expect(requests.every(({ url }) => url === "https://api.github.com/app/installations/98765/access_tokens")).toBe(true);
  });
});

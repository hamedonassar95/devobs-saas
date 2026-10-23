import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVOBS_SOURCE_SHA } from "@/lib/devobs/catalog";
import { auditGitHubRepository, buildDevobsCiWorkflow, createDevobsRepairPullRequest, type RepositoryAudit } from "./devobs-remediation";

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Devobs repository audit and repair proposal", () => {
  it("builds only read-only reusable CI calls pinned to the audited Devobs revision", () => {
    const workflow = buildDevobsCiWorkflow(["node", "python", "node"], "main");
    expect(workflow.match(/uses: /g)).toHaveLength(2);
    expect(workflow).toContain(`@${DEVOBS_SOURCE_SHA}`);
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).not.toContain("contents: write");
    expect(() => buildDevobsCiWorkflow(["node"], "main\n  permissions: write-all")).toThrow();
  });

  it("offers a deterministic repair only for a Node repository with a lockfile", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/platform")) return jsonResponse({ default_branch: "main" });
      if (url.endsWith("/branches/main")) return jsonResponse({ commit: { sha: "a".repeat(40), commit: { sha: "a".repeat(40), tree: { sha: "tree-1" } } } });
      if (url.includes("/git/trees/tree-1?recursive=1")) return jsonResponse({ truncated: false, tree: [
        { path: "package.json", type: "blob", mode: "100644" },
        { path: "package-lock.json", type: "blob", mode: "100644" },
      ] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const audit = await auditGitHubRepository("fake-installation-token-for-unit-tests-123456", "https://github.com/acme/platform");
    expect(audit).toMatchObject({ status: "repair-available", detectedStacks: ["node"], repairable: true });
    expect(audit.workflowContent).toContain(`uses: hamedonassar95/Devobs/.github/workflows/reusable-node-ci.yml@${DEVOBS_SOURCE_SHA}`);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recognizes a Devobs reusable workflow and does not offer a second one", async () => {
    const workflow = `jobs:\n  validate:\n    uses: hamedonassar95/Devobs/.github/workflows/reusable-node-ci.yml@${DEVOBS_SOURCE_SHA}\n`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/platform")) return jsonResponse({ default_branch: "main" });
      if (url.endsWith("/branches/main")) return jsonResponse({ commit: { sha: "a".repeat(40), commit: { sha: "a".repeat(40), tree: { sha: "tree-1" } } } });
      if (url.includes("/git/trees/tree-1?recursive=1")) return jsonResponse({ truncated: false, tree: [{ path: ".github/workflows/ci.yml", type: "blob", mode: "100644" }] });
      if (url.includes("/contents/.github/workflows/ci.yml?ref=main")) return jsonResponse({ type: "file", encoding: "base64", content: Buffer.from(workflow).toString("base64") });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const audit = await auditGitHubRepository("fake-installation-token-for-unit-tests-123456", "https://github.com/acme/platform");
    expect(audit).toMatchObject({ status: "already-integrated", repairable: false });
    expect(audit.workflowContent).toBeUndefined();
  });

  it("encodes slash-separated default branches and fails closed on incomplete trees", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/repos/acme/platform")) return jsonResponse({ default_branch: "release/next" });
      if (url.endsWith("/branches/release%2Fnext")) return jsonResponse({ commit: { commit: { tree: { sha: "tree-1" } } } });
      if (url.includes("/git/trees/tree-1?recursive=1")) return jsonResponse({ tree: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const audit = await auditGitHubRepository("fake-installation-token-for-unit-tests-123456", "https://github.com/acme/platform");
    expect(audit).toMatchObject({ status: "manual-review", repairable: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not audit a repository owned outside the connected installation account", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const audit = await auditGitHubRepository("fake-installation-token-for-unit-tests-123456", "https://github.com/another-account/platform", "acme");
    expect(audit).toMatchObject({ status: "manual-review", repairable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a PR from a new branch without writing to the default branch", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes("/pulls?state=open&per_page=100")) return jsonResponse([]);
      if (url.endsWith("/branches/main")) return jsonResponse({ commit: { sha: "a".repeat(40), commit: { sha: "a".repeat(40) } } });
      if (url.endsWith("/git/refs")) return jsonResponse({ ref: "refs/heads/devobs/repair" }, 201);
      if (url.includes("/contents/.github/workflows/devobs-shared-ci.yml")) return jsonResponse({ content: { path: ".github/workflows/devobs-shared-ci.yml" } }, 201);
      if (url.endsWith("/pulls")) return jsonResponse({ number: 42, html_url: "https://github.com/acme/platform/pull/42" }, 201);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const audit: RepositoryAudit = {
      repository: { owner: "acme", name: "platform", fullName: "acme/platform" },
      defaultBranch: "main",
      status: "repair-available",
      message: "repair",
      detectedStacks: ["node"],
      repairable: true,
      workflowContent: buildDevobsCiWorkflow(["node"], "main"),
    };

    const result = await createDevobsRepairPullRequest("fake-installation-token-for-unit-tests-123456", audit, 1_800_000_000_000);
    expect(result).toMatchObject({ number: 42, url: "https://github.com/acme/platform/pull/42" });
    expect(requests.map(({ init }) => init?.method)).toEqual(["GET", "GET", "POST", "PUT", "POST"]);
    expect(result.branch).toMatch(/^devobs\/repair-shared-ci-\d{4}-\d{2}-\d{2}-[a-f0-9]{10}$/);
    expect(String(requests[2].init?.body)).toContain('"ref":"refs/heads/' + result.branch + '"');
    expect(String(requests[3].init?.body)).toContain('"branch":"' + result.branch + '"');
    expect(JSON.parse(String(requests[4].init?.body))).toMatchObject({ base: "main", draft: true });
    expect(requests.every(({ url }) => !url.endsWith("/contents/.github/workflows/devobs-shared-ci.yml?ref=main"))).toBe(true);
  });
});

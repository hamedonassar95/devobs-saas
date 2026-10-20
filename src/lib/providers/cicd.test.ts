import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError, listPipelineRuns } from "./cicd";

afterEach(() => vi.unstubAllGlobals());

describe("read-only CI/CD provider connectors", () => {
  it("reads GitHub Actions runs without triggering or modifying workflows", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({
        workflow_runs: [{ id: 42, name: "tests", status: "completed", conclusion: "success", html_url: "https://github.com/acme/app/actions/runs/42", created_at: "2026-10-20T00:00:00Z" }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const runs = await listPipelineRuns({ provider: "GITHUB", repositoryUrl: "https://github.com/acme/app" }, "ghp_read_only_token");

    expect(runs).toEqual([{
      id: "42",
      name: "tests",
      status: "completed",
      conclusion: "success",
      url: "https://github.com/acme/app/actions/runs/42",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: null,
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/acme/app/actions/runs?per_page=20");
    expect(init?.method).toBeUndefined();
    expect(init?.headers).toMatchObject({ Authorization: "Bearer ghp_read_only_token" });
    expect(init?.redirect).toBe("error");
  });

  it("encodes GitLab subgroup repository paths for a read-only pipeline query", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify([
        { id: 7, ref: "main", status: "success", web_url: "https://gitlab.com/acme/platform/api/-/pipelines/7", created_at: "2026-10-20T00:00:00Z" },
      ]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const runs = await listPipelineRuns({ provider: "GITLAB", repositoryUrl: "https://gitlab.com/acme/platform/api" }, "glpat_read_only_token");

    expect(runs[0]).toMatchObject({ id: "7", name: "main", status: "success", conclusion: "success" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://gitlab.com/api/v4/projects/acme%2Fplatform%2Fapi/pipelines?per_page=20");
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("normalizes Bitbucket pipeline results and enforces a fixed provider host", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({
        values: [{ uuid: "{run-1}", build_number: 9, target: { ref_name: "main" }, state: { name: "COMPLETED", result: { name: "SUCCESSFUL" } }, links: { html: { href: "https://bitbucket.org/acme/app/addon/pipelines/home#!/results/9" } } }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const runs = await listPipelineRuns({ provider: "BITBUCKET", repositoryUrl: "https://bitbucket.org/acme/app" }, "bb_read_only_token");
    expect(runs[0]).toMatchObject({ id: "{run-1}", name: "main", status: "COMPLETED", conclusion: "successful" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://api.bitbucket.org/2.0/repositories/acme/app/pipelines/");

    await expect(listPipelineRuns({ provider: "GITHUB", repositoryUrl: "https://example.com/acme/app" }, "ghp_read_only_token"))
      .rejects.toBeInstanceOf(ProviderRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires a token per request and hides upstream response details", async () => {
    const fetchMock = vi.fn(async () => new Response("private upstream details", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listPipelineRuns({ provider: "GITHUB", repositoryUrl: "https://github.com/acme/app" }, null))
      .rejects.toThrow("X-CICD-Provider-Token");
    await expect(listPipelineRuns({ provider: "GITHUB", repositoryUrl: "https://github.com/acme/app" }, "ghp_read_only_token"))
      .rejects.toThrow("provider rejected");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps provider responses before JSON parsing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ workflow_runs: [], oversized: "x".repeat(1_048_600) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listPipelineRuns({ provider: "GITHUB", repositoryUrl: "https://github.com/acme/app" }, "ghp_read_only_token"))
      .rejects.toThrow("response was too large");
  });
});

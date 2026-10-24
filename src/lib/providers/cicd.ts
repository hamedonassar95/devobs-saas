import type { CiCdIntegration, CiCdProvider } from "@prisma/client";
import { BoundedResponseJsonError, readBoundedResponseJson } from "@/lib/http/bounded-json";

export type PipelineRun = {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export class ProviderRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeRepositoryPath(repositoryUrl: string, host: string, minSegments: number, maxSegments = minSegments) {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new ProviderRequestError("Repository URL is invalid.");
  }

  if (url.protocol !== "https:" || url.hostname !== host || url.port || url.username || url.password || url.search || url.hash) {
    throw new ProviderRequestError("Repository URL must be a plain HTTPS URL on the selected provider.");
  }

  const segments = url.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      throw new ProviderRequestError("Repository URL contains invalid path encoding.");
    }
  });
  if (segments.at(-1)?.endsWith(".git")) segments[segments.length - 1] = segments.at(-1)!.slice(0, -4);
  if (segments.length < minSegments || segments.length > maxSegments || segments.some((part) => !/^[\w.-]+$/.test(part) || part === "." || part === "..")) {
    throw new ProviderRequestError("Repository URL must identify a repository on the selected provider.");
  }
  return segments;
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProviderRequestError("The CI/CD provider could not be reached.", 502);
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderRequestError("The CI/CD provider rejected the read-only request.", response.status === 401 || response.status === 403 ? 400 : 502);
  }
  try {
    return await readBoundedResponseJson(response, 1_048_576);
  } catch (error) {
    if (!(error instanceof BoundedResponseJsonError)) throw error;
    if (error.code === "too-large") {
      throw new ProviderRequestError("The CI/CD provider response was too large.", 502);
    }
    if (error.code === "unavailable") {
      throw new ProviderRequestError("The CI/CD provider returned an empty response.", 502);
    }
    throw new ProviderRequestError("The CI/CD provider returned invalid JSON.", 502);
  }
}

function requireToken(token: string | null): string {
  if (!token || token.length < 8 || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new ProviderRequestError("Send a valid read-only provider token using the X-CICD-Provider-Token header.");
  }
  return token;
}

function githubRun(value: unknown): PipelineRun | null {
  const run = asRecord(value);
  if (!run) return null;
  const id = run.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  return {
    id: String(id),
    name: stringValue(run.name) ?? "GitHub Actions run",
    status: stringValue(run.status) ?? "unknown",
    conclusion: stringValue(run.conclusion),
    url: stringValue(run.html_url),
    createdAt: stringValue(run.created_at),
    updatedAt: stringValue(run.updated_at),
  };
}

function gitlabRun(value: unknown): PipelineRun | null {
  const run = asRecord(value);
  if (!run || (typeof run.id !== "string" && typeof run.id !== "number")) return null;
  return {
    id: String(run.id),
    name: stringValue(run.ref) ?? "GitLab pipeline",
    status: stringValue(run.status) ?? "unknown",
    conclusion: stringValue(run.status) === "success" ? "success" : stringValue(run.status) === "failed" ? "failure" : null,
    url: stringValue(run.web_url),
    createdAt: stringValue(run.created_at),
    updatedAt: stringValue(run.updated_at),
  };
}

function bitbucketRun(value: unknown): PipelineRun | null {
  const run = asRecord(value);
  if (!run || (typeof run.uuid !== "string" && typeof run.build_number !== "number")) return null;
  const state = asRecord(run.state);
  const target = asRecord(run.target);
  const links = asRecord(run.links);
  const html = asRecord(links?.html);
  const result = asRecord(state?.result);
  return {
    id: stringValue(run.uuid) ?? String(run.build_number),
    name: stringValue(target?.ref_name) ?? "Bitbucket pipeline",
    status: stringValue(state?.name) ?? "unknown",
    conclusion: stringValue(result?.name)?.toLowerCase() ?? null,
    url: stringValue(html?.href),
    createdAt: stringValue(run.created_on),
    updatedAt: stringValue(run.completed_on),
  };
}

function arrayFrom(payload: unknown, key: string): unknown[] {
  const record = asRecord(payload);
  const value = Array.isArray(payload) ? payload : record?.[key];
  return Array.isArray(value) ? value : [];
}

export async function listPipelineRuns(integration: Pick<CiCdIntegration, "repositoryUrl"> & { provider: CiCdProvider }, tokenInput: string | null): Promise<PipelineRun[]> {
  const token = requireToken(tokenInput);
  let endpoint: string;
  let headers: Record<string, string>;
  let mapRun: (value: unknown) => PipelineRun | null;
  let arrayKey: string;

  switch (integration.provider) {
    case "GITHUB": {
      const [owner, repo] = safeRepositoryPath(integration.repositoryUrl, "github.com", 2);
      endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=20`;
      headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
      mapRun = githubRun;
      arrayKey = "workflow_runs";
      break;
    }
    case "GITLAB": {
      const path = safeRepositoryPath(integration.repositoryUrl, "gitlab.com", 2, 20).join("/");
      endpoint = `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}/pipelines?per_page=20`;
      headers = { "PRIVATE-TOKEN": token, Accept: "application/json" };
      mapRun = gitlabRun;
      arrayKey = "";
      break;
    }
    case "BITBUCKET": {
      const [workspace, repo] = safeRepositoryPath(integration.repositoryUrl, "bitbucket.org", 2);
      endpoint = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}/pipelines/?pagelen=20`;
      headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      mapRun = bitbucketRun;
      arrayKey = "values";
      break;
    }
    default:
      throw new ProviderRequestError("This CI/CD provider is not enabled.");
  }

  const payload = await getJson(endpoint, headers);
  return arrayFrom(payload, arrayKey).slice(0, 20).map(mapRun).filter((run): run is PipelineRun => run !== null);
}

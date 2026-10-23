import { DEVOBS_SOURCE_SHA } from "@/lib/devobs/catalog";
import { createHash } from "node:crypto";
import { GitHubAppError, githubApiRequest, parseGitHubRepositoryUrl, type RepositoryRef } from "./app";

const DEVOBS_REPOSITORY = "hamedonassar95/Devobs";
const MAX_TREE_ENTRIES = 25_000;
const MAX_WORKFLOW_FILES_TO_INSPECT = 5;
const REMEDIATION_PATH = ".github/workflows/devobs-shared-ci.yml";

type JsonRecord = Record<string, unknown>;
type TreeEntry = { path: string; type: string; mode: string };
export type SupportedStack = "node" | "python" | "php" | "bash";

export type RepositoryAudit = Readonly<{
  repository: RepositoryRef;
  defaultBranch: string;
  status: "already-integrated" | "update-needed" | "repair-available" | "manual-review";
  message: string;
  detectedStacks: readonly SupportedStack[];
  repairable: boolean;
  workflowContent?: string;
}>;

export type PullRequestResult = Readonly<{ number: number; url: string; branch: string }>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function apiPath(repository: RepositoryRef, suffix: string): string {
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}${suffix}`;
}

function safeDefaultBranch(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200 || !/^[A-Za-z0-9._/-]+$/.test(value) || value.startsWith("-") || value.includes("..") || value.endsWith("/")) return null;
  return value;
}

function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildDevobsCiWorkflow(stacks: readonly SupportedStack[], defaultBranch: string): string {
  const branch = safeDefaultBranch(defaultBranch);
  if (!branch) throw new Error("Unsupported default branch name.");
  const uniqueStacks = [...new Set(stacks)];
  if (!uniqueStacks.length || uniqueStacks.some((stack) => !["node", "python", "php", "bash"].includes(stack))) {
    throw new Error("No supported stack was selected.");
  }
  const workflowNames: Record<SupportedStack, string> = {
    node: "reusable-node-ci.yml",
    python: "reusable-python-ci.yml",
    php: "reusable-php-ci.yml",
    bash: "reusable-bash-ci.yml",
  };
  const labels: Record<SupportedStack, string> = {
    node: "Node.js validation",
    python: "Python validation",
    php: "PHP and Composer validation",
    bash: "Bash validation",
  };
  const jobs = uniqueStacks.map((stack) => [
    `  ${stack}:`,
    `    name: ${labels[stack]}`,
    `    uses: ${DEVOBS_REPOSITORY}/.github/workflows/${workflowNames[stack]}@${DEVOBS_SOURCE_SHA}`,
  ].join("\n"));
  return [
    "name: Devobs Shared CI",
    "on:",
    "  pull_request:",
    "  push:",
    "    branches:",
    `      - ${yamlQuote(branch)}`,
    "permissions:",
    "  contents: read",
    "  pull-requests: read",
    "jobs:",
    ...jobs,
    "",
  ].join("\n");
}

async function readFile(token: string, repository: RepositoryRef, path: string, ref: string): Promise<string | null> {
  let payload: unknown;
  try {
    payload = await githubApiRequest(token, `${apiPath(repository, `/contents/${path.split("/").map(encodeURIComponent).join("/")}`)}?ref=${encodeURIComponent(ref)}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) return null;
    throw error;
  }
  const record = asRecord(payload);
  if (!record || record.type !== "file" || record.encoding !== "base64" || typeof record.content !== "string" || record.content.length > 1_400_000) {
    throw new GitHubAppError("GitHub file data could not be validated.");
  }
  const encoded = record.content.replace(/\s/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new GitHubAppError("GitHub file data could not be validated.");
  }
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    if (Buffer.byteLength(decoded, "utf8") > 1_048_576) throw new GitHubAppError("GitHub file data could not be validated.");
    return decoded;
  } catch {
    throw new GitHubAppError("GitHub file data could not be validated.");
  }
}

export async function auditGitHubRepository(token: string, repositoryUrl: string, expectedOwner?: string): Promise<RepositoryAudit> {
  const repository = parseGitHubRepositoryUrl(repositoryUrl);
  if (expectedOwner && repository.owner.toLowerCase() !== expectedOwner.toLowerCase()) {
    return { repository, defaultBranch: "", status: "manual-review", message: "The repository owner does not match the connected GitHub App account.", detectedStacks: [], repairable: false };
  }
  const repositoryData = asRecord(await githubApiRequest(token, apiPath(repository, "")));
  const defaultBranch = safeDefaultBranch(repositoryData?.default_branch);
  if (!defaultBranch) {
    return { repository, defaultBranch: "", status: "manual-review", message: "The default branch name is unsupported; review this repository manually.", detectedStacks: [], repairable: false };
  }

  const branchData = asRecord(await githubApiRequest(token, apiPath(repository, `/branches/${encodeURIComponent(defaultBranch)}`)));
  const commit = asRecord(branchData?.commit);
  const commitData = asRecord(commit?.commit);
  const treeInfo = asRecord(commitData?.tree);
  const treeSha = typeof treeInfo?.sha === "string" ? treeInfo.sha : null;
  if (!treeSha) throw new Error("GitHub repository tree is unavailable.");

  const treeData = asRecord(await githubApiRequest(token, apiPath(repository, `/git/trees/${encodeURIComponent(treeSha)}?recursive=1`)));
  if (!treeData || treeData.truncated !== false || !Array.isArray(treeData.tree) || treeData.tree.length > MAX_TREE_ENTRIES) {
    return { repository, defaultBranch, status: "manual-review", message: "The repository tree is too large or incomplete for a safe automatic check.", detectedStacks: [], repairable: false };
  }
  const tree = treeData.tree.map(asRecord).filter((entry): entry is JsonRecord => entry !== null).map((entry) => ({
    path: typeof entry.path === "string" ? entry.path : "",
    type: typeof entry.type === "string" ? entry.type : "",
    mode: typeof entry.mode === "string" ? entry.mode : "",
  } satisfies TreeEntry)).filter((entry) => entry.path && entry.type === "blob");

  if (tree.some((entry) => entry.mode === "120000" && /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(entry.path))) {
    return { repository, defaultBranch, status: "manual-review", message: "A workflow path is a symbolic link; review manually before proposing changes.", detectedStacks: [], repairable: false };
  }
  const workflowFiles = tree.filter((entry) => (entry.mode === "100644" || entry.mode === "100755") && /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(entry.path));
  if (workflowFiles.length > MAX_WORKFLOW_FILES_TO_INSPECT) {
    return { repository, defaultBranch, status: "manual-review", message: "There are too many workflow files to inspect safely; review manually.", detectedStacks: [], repairable: false };
  }
  for (const file of workflowFiles) {
    const contents = await readFile(token, repository, file.path, defaultBranch);
    if (!contents) continue;
    if (contents.includes(`${DEVOBS_REPOSITORY}/.github/workflows/`)) {
      const usesPinnedRevision = contents.includes(`@${DEVOBS_SOURCE_SHA}`);
      return {
        repository,
        defaultBranch,
        status: usesPinnedRevision ? "already-integrated" : "update-needed",
        message: usesPinnedRevision ? "A Devobs reusable workflow is already referenced at the audited source revision." : "A Devobs reusable workflow exists but is not pinned to the audited source revision; update it manually.",
        detectedStacks: [],
        repairable: false,
      };
    }
  }

  if (tree.some((entry) => entry.path === REMEDIATION_PATH)) {
    return { repository, defaultBranch, status: "manual-review", message: "The proposed workflow path already exists and will not be overwritten.", detectedStacks: [], repairable: false };
  }

  const regularFiles = tree.filter((entry) => entry.mode === "100644" || entry.mode === "100755");
  const paths = new Set(regularFiles.map((entry) => entry.path));
  const stacks: SupportedStack[] = [];
  if (paths.has("package.json") && paths.has("package-lock.json")) stacks.push("node");
  if (regularFiles.some((entry) => entry.path.startsWith("tests/")) && regularFiles.some((entry) => entry.path.endsWith(".py"))
    && (paths.has("pyproject.toml") || paths.has("requirements.txt") || paths.has("requirements-dev.txt"))) stacks.push("python");
  if (paths.has("composer.json") && paths.has("composer.lock")) {
    const composer = await readFile(token, repository, "composer.json", defaultBranch);
    if (!composer) {
      return { repository, defaultBranch, status: "manual-review", message: "The Composer manifest could not be read; review manually.", detectedStacks: [], repairable: false };
    }
    try {
      const parsed = asRecord(JSON.parse(composer) as unknown);
      const scripts = asRecord(parsed?.scripts);
      if (typeof scripts?.test === "string" || Array.isArray(scripts?.test)) stacks.push("php");
    } catch {
      return { repository, defaultBranch, status: "manual-review", message: "The Composer manifest could not be validated; review manually.", detectedStacks: [], repairable: false };
    }
  }
  if (regularFiles.some((entry) => entry.path.endsWith(".sh"))) stacks.push("bash");
  if (!stacks.length) {
    return { repository, defaultBranch, status: "manual-review", message: "No supported, safely detectable project checks were found.", detectedStacks: [], repairable: false };
  }

  return {
    repository,
    defaultBranch,
    status: "repair-available",
    message: "Devobs Shared CI is missing. A deterministic workflow can be added in an isolated branch for review.",
    detectedStacks: stacks,
    repairable: true,
    workflowContent: buildDevobsCiWorkflow(stacks, defaultBranch),
  };
}

export async function createDevobsRepairPullRequest(
  token: string,
  audit: RepositoryAudit,
  now = Date.now(),
): Promise<PullRequestResult> {
  if (!audit.repairable || !audit.workflowContent || audit.status !== "repair-available" || !audit.defaultBranch) {
    throw new Error("This repository does not have an eligible automatic repair.");
  }
  const { repository, defaultBranch } = audit;
  const openPullRequests = await githubApiRequest(token, apiPath(repository, "/pulls?state=open&per_page=100"));
  if (!Array.isArray(openPullRequests)) throw new GitHubAppError("GitHub returned invalid pull request data.");
  if (openPullRequests.some((item) => {
    const pullRequest = asRecord(item);
    return pullRequest?.title === "Add Devobs shared CI workflow"
      && typeof pullRequest.body === "string"
      && pullRequest.body.includes("<!-- devobs-repair:shared-ci -->");
  })) {
    throw new GitHubAppError("An open Devobs shared CI repair pull request already exists.", 409);
  }
  const defaultBranchData = asRecord(await githubApiRequest(token, apiPath(repository, `/branches/${encodeURIComponent(defaultBranch)}`)));
  const commit = asRecord(defaultBranchData?.commit);
  const commitData = asRecord(commit?.commit);
  const sha = commitData?.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) throw new Error("Default branch commit could not be verified.");

  const day = new Date(now).toISOString().slice(0, 10);
  const repoHash = createHash("sha256").update(repository.fullName.toLowerCase()).digest("hex").slice(0, 10);
  const branch = `devobs/repair-shared-ci-${day}-${repoHash}`;
  await githubApiRequest(token, apiPath(repository, "/git/refs"), "POST", { ref: `refs/heads/${branch}`, sha });
  const filePath = REMEDIATION_PATH.split("/").map(encodeURIComponent).join("/");
  await githubApiRequest(token, apiPath(repository, `/contents/${filePath}`), "PUT", {
    message: "Add Devobs shared CI workflow",
    content: Buffer.from(audit.workflowContent, "utf8").toString("base64"),
    branch,
  });
  const pullRequest = asRecord(await githubApiRequest(token, apiPath(repository, "/pulls"), "POST", {
    title: "Add Devobs shared CI workflow",
    head: branch,
    base: defaultBranch,
    body: [
      "## Summary",
      "- Add the Devobs reusable CI workflow for the project checks detected in the repository.",
      `- Pin the reusable workflow to Devobs source commit \`${DEVOBS_SOURCE_SHA}\`.`,
      "- Keep the workflow read-only; no deployment, merge, or cloud-resource permissions are added.",
      "<!-- devobs-repair:shared-ci -->",
      "",
      "## Review",
      "Please review the workflow and confirm the configured tests match this repository before merging.",
    ].join("\n"),
    draft: true,
  }));
  if (typeof pullRequest?.number !== "number" || typeof pullRequest.html_url !== "string" || !pullRequest.html_url.startsWith("https://github.com/")) {
    throw new Error("GitHub did not return a valid pull request link.");
  }
  return { number: pullRequest.number, url: pullRequest.html_url, branch };
}

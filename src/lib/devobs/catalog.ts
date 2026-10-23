export const DEVOBS_SOURCE_SHA = "e1b1f704cf963a4e1f4a39f7e1e8d719dbb88815";
const DEVOBS_SOURCE = `https://github.com/hamedonassar95/Devobs/blob/${DEVOBS_SOURCE_SHA}`;

export type DevobsCatalogEntry = Readonly<{
  id: string;
  category: string;
  title: string;
  summary: string;
  capabilities: readonly string[];
  sourcePath: string;
  sourceStatus: "VERIFIED (source)";
  runtimeStatus: "UNVERIFIED";
}>;

export const DEVOBS_CATALOG: readonly DevobsCatalogEntry[] = [
  {
    id: "change-analysis",
    category: "CI/CD",
    title: "Change analysis and shared CI",
    summary: "The automation hub selects relevant validation from changed files. Security and site-contract checks remain required; its risk estimate is advisory.",
    capabilities: [
      "Reusable CI for Bash, Node.js, Python, and PHP/Composer",
      "Pull request checks and downloadable preview artifacts",
      "No external AI inference for change-risk estimates",
    ],
    sourcePath: "docs/AUTOMATION_HUB.md",
    sourceStatus: "VERIFIED (source)",
    runtimeStatus: "UNVERIFIED",
  },
  {
    id: "deployment-health",
    category: "Release safety",
    title: "Deploy and health verification",
    summary: "The documented Pages path deploys after CI, verifies the published commit, and checks the live site before treating a release as healthy.",
    capabilities: [
      "Commit freshness checks before publishing",
      "Post-deploy SHA and health verification",
      "Guarded restoration after the new deploy fails its checks",
    ],
    sourcePath: "docs/AUTOMATION_HUB.md",
    sourceStatus: "VERIFIED (source)",
    runtimeStatus: "UNVERIFIED",
  },
  {
    id: "policy-audit",
    category: "Security",
    title: "Repository policy audit",
    summary: "A scheduled and manual read-only audit reports drift in repository protections and required checks; it does not change GitHub settings.",
    capabilities: [
      "Default branch and ruleset checks",
      "Required validation and CodeQL policy checks",
      "Read-only findings for human review",
    ],
    sourcePath: ".github/workflows/repository-policy-audit.yml",
    sourceStatus: "VERIFIED (source)",
    runtimeStatus: "UNVERIFIED",
  },
  {
    id: "capacity-advice",
    category: "Operations",
    title: "Capacity recommendations",
    summary: "A bounded recommendation uses supplied CPU and memory metrics to suggest scaling. It does not connect to a cloud provider or apply infrastructure changes.",
    capabilities: [
      "Interpretable horizontal scaling advice",
      "Configured minimum, maximum, and cooldown bounds",
      "No direct cloud resource mutation",
    ],
    sourcePath: "docs/RESOURCE_OPTIMIZATION.md",
    sourceStatus: "VERIFIED (source)",
    runtimeStatus: "UNVERIFIED",
  },
  {
    id: "incident-response",
    category: "Incident response",
    title: "Incident evidence and AI investigation",
    summary: "Incident Response gathers evidence. AI investigation is advisory, and documented recovery remains behind human review.",
    capabilities: [
      "Failure classification and evidence collection",
      "Copilot investigation with a bounded Vertex fallback path",
      "No automatic merge, deployment, or rollback",
    ],
    sourcePath: "docs/AI_DEVOPS_CONTROL_ROOM.md",
    sourceStatus: "VERIFIED (source)",
    runtimeStatus: "UNVERIFIED",
  },
  {
    id: "manual-release-actions",
    category: "Controlled operations",
    title: "Manual deploy and rollback paths",
    summary: "Exceptional deployment and rollback workflows require an explicit operator-selected target and follow documented safeguards.",
    capabilities: [
      "One-click deploy for a selected revision",
      "Manual Pages rollback with eligibility checks",
      "Separate from the normal automatic release path",
    ],
    sourcePath: "docs/AUTOMATION_HUB.md",
    sourceStatus: "VERIFIED (source)",
    runtimeStatus: "UNVERIFIED",
  },
];

export function getDevobsSourceUrl(sourcePath: string): string {
  return `${DEVOBS_SOURCE}/${sourcePath}`;
}

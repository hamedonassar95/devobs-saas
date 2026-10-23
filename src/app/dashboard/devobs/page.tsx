import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DEVOBS_CATALOG, DEVOBS_SOURCE_SHA, getDevobsSourceUrl } from "@/lib/devobs/catalog";
import DevobsAudits from "./audits";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ organization?: string; github?: string }> };

const githubMessages: Record<string, { text: string; kind: "success" | "error" }> = {
  connected: { text: "GitHub App connected to the selected organization.", kind: "success" },
  "permissions-required": { text: "Grant the GitHub App Contents and Pull requests permissions, then retry. Workflows: write is also needed to create repair PRs.", kind: "error" },
  "installation-not-authorized": { text: "The GitHub account you authorized cannot access this App installation. Reconnect using an account with access.", kind: "error" },
  "installation-mismatch": { text: "GitHub returned inconsistent installation details. No installation was linked.", kind: "error" },
  "invalid-installation": { text: "GitHub returned an invalid installation. Start the connection again.", kind: "error" },
  "installation-in-use": { text: "This GitHub App installation is already linked to another organization.", kind: "error" },
  "sign-in-again": { text: "Sign in again, then restart the GitHub App connection.", kind: "error" },
  "invalid-state": { text: "The connection request expired or could not be verified. Start again.", kind: "error" },
  cancelled: { text: "GitHub App installation was canceled.", kind: "error" },
  failed: { text: "GitHub App installation could not be linked. Check access and try again.", kind: "error" },
};

export default async function DevobsControlRoomPage({ searchParams }: PageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { role: true, organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const organizations = memberships.map(({ organization, role }) => ({ ...organization, role }));
  const query = await searchParams;
  const githubMessage = query.github ? githubMessages[query.github] : undefined;

  return (
    <main className="ai-console devobs-control-room">
      <header className="ai-console-header">
        <Link className="brand" href="/" aria-label="Devobs home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>devobs<span className="brand-period">.</span></span>
        </Link>
        <nav aria-label="Workspace navigation">
          <Link href="/dashboard/ai">Incident analysis</Link>
          <Link href="/billing">Billing</Link>
          <Link href="/">Marketing site</Link>
        </nav>
      </header>

      <section className="ai-console-intro">
        <p className="eyebrow">DEVOBS AUTOMATION HUB</p>
        <h1>Operations control room</h1>
        <p>Browse the documented Devobs components and see what the source proves. Source configuration is not a live health check.</p>
      </section>

      <section className="devobs-source-panel" aria-labelledby="devobs-source-heading">
        <div>
          <p className="ai-kicker">SOURCE SNAPSHOT</p>
          <h2 id="devobs-source-heading">Devobs automation repository</h2>
          <p>Repository: <code>hamedonassar95/Devobs</code> · Commit: <code>{DEVOBS_SOURCE_SHA.slice(0, 7)}</code></p>
        </div>
        <a href={getDevobsSourceUrl("docs/AUTOMATION_HUB.md")} target="_blank" rel="noreferrer">Open source hub ↗</a>
      </section>

      {githubMessage && <p className={`ai-message ai-message-${githubMessage.kind}`} role={githubMessage.kind === "error" ? "alert" : "status"}>{githubMessage.text}</p>}
      {organizations.length === 0 ? (
        <section className="ai-empty-state">
          <h2>No active organization is linked</h2>
          <p>The source catalog is available, but repository audits and repair proposals need an active organization.</p>
          <Link className="button button-outline" href="/register">Create an organization</Link>
        </section>
      ) : (
        <section className="devobs-organization-note" aria-label="Organization access">
          <strong>{organizations.length} active organization{organizations.length === 1 ? "" : "s"}</strong>
          <span>Catalog access is shared; repository findings and repairs remain scoped to each organization.</span>
        </section>
      )}

      <DevobsAudits organizations={organizations} initialOrganizationId={query.organization} />

      <section className="devobs-catalog" aria-label="Documented Devobs components">
        {DEVOBS_CATALOG.map((entry) => (
          <article className="devobs-catalog-card" key={entry.id}>
            <div className="devobs-card-heading">
              <div>
                <p className="ai-kicker">{entry.category}</p>
                <h2>{entry.title}</h2>
              </div>
              <span className="ai-status is-enabled">{entry.sourceStatus}</span>
            </div>
            <p className="devobs-card-summary">{entry.summary}</p>
            <ul>
              {entry.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
            </ul>
            <div className="devobs-card-footer">
              <span className="ai-status is-muted">Live runtime: {entry.runtimeStatus}</span>
              <a href={getDevobsSourceUrl(entry.sourcePath)} target="_blank" rel="noreferrer">View source ↗</a>
            </div>
          </article>
        ))}
      </section>

      <section className="devobs-repair-note">
        <p className="ai-kicker">REPAIR FLOW</p>
        <h2>Diagnose → isolated branch → checks → pull request</h2>
        <p>Repairs must be reviewed before merge. This page does not merge changes or deploy to production.</p>
        <p className="ai-help">Source snapshot: <a href={getDevobsSourceUrl("docs/AI_DEVOPS_CONTROL_ROOM.md")} target="_blank" rel="noreferrer">AI DevOps Control Room ↗</a></p>
      </section>
    </main>
  );
}

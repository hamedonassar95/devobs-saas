"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Organization = { id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" };
type RepositoryAudit = {
  integrationId: string;
  name: string;
  repositoryUrl: string;
  status: "already-integrated" | "update-needed" | "repair-available" | "manual-review";
  message: string;
  detectedStacks: string[];
  repairable: boolean;
};
type AuditResponse = {
  status: "not-configured" | "not-connected" | "no-repositories" | "ready";
  accountLogin?: string;
  workflowsWriteEnabled?: boolean;
  repositories: RepositoryAudit[];
};

const canManage = (role: Organization["role"] | undefined) => role === "OWNER" || role === "ADMIN";

export default function DevobsAudits({ organizations, initialOrganizationId }: { organizations: Organization[]; initialOrganizationId?: string }) {
  const [organizationId, setOrganizationId] = useState(initialOrganizationId && organizations.some(({ id }) => id === initialOrganizationId) ? initialOrganizationId : organizations[0]?.id ?? "");
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pullRequestUrl, setPullRequestUrl] = useState<string | null>(null);
  const [repositoryName, setRepositoryName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const organization = organizations.find(({ id }) => id === organizationId);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!organizationId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/devobs-audit`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null) as (AuditResponse & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? "Repository audit could not be loaded.");
      setAudit(payload);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Repository audit could not be loaded.");
      setAudit(null);
    } finally {
      setBusy(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function connectRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "GITHUB", name: repositoryName, repositoryUrl }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Repository could not be added.");
      setRepositoryName("");
      setRepositoryUrl("");
      setMessage("Repository added. Run the audit to check access and shared CI.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repository could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function createRepair(integrationId: string) {
    if (!organizationId) return;
    setBusy(true);
    setMessage(null);
    setPullRequestUrl(null);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/devobs-repairs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; pullRequest?: { url?: string; number?: number } } | null;
      if (!response.ok || !payload?.pullRequest?.url) throw new Error(payload?.error ?? "Repair pull request could not be created.");
      setMessage(`Draft pull request #${payload.pullRequest.number} was created for review.`);
      setPullRequestUrl(payload.pullRequest.url);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repair pull request could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="devobs-audit-workspace" aria-label="Repository audit and repair">
      {organizations.length > 0 && (
        <div className="ai-console-toolbar">
          <label htmlFor="devobs-organization">Organization</label>
          <select id="devobs-organization" value={organizationId} disabled={busy} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <span className="ai-role-badge">{organization?.role ?? "Member"}</span>
          <button className="button button-outline" type="button" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : "Refresh audit"}</button>
        </div>
      )}

      {error && <p className="ai-message ai-message-error" role="alert">{error}</p>}
      {message && <p className="ai-message ai-message-success" role="status">{message}</p>}
      {pullRequestUrl && <p><a href={pullRequestUrl} target="_blank" rel="noopener noreferrer">Open draft pull request ↗</a></p>}
      {busy && !audit && <p className="ai-loading" role="status">Checking the selected organization…</p>}

      {audit?.status === "not-configured" && (
        <section className="ai-empty-state"><h2>GitHub App is not configured</h2><p>An operator must configure the server-side app ID, slug, private key, and state secret before repository audits can run.</p></section>
      )}
      {audit?.status === "not-connected" && (
        <section className="ai-empty-state">
          <h2>Connect the organization’s GitHub App</h2>
          <p>The installation is stored only as organization metadata. Short-lived access tokens are created for each audit or repair request and are not saved.</p>
          {canManage(organization?.role)
            ? <a className="button button-primary" href={`/api/organizations/${encodeURIComponent(organizationId)}/github-app/install`}>Connect GitHub App</a>
            : <p>Ask an organization owner or admin to connect the GitHub App.</p>}
        </section>
      )}
      {audit?.status === "no-repositories" && (
        <section className="ai-empty-state">
          <h2>No GitHub repositories connected</h2>
          <p>Add a repository below after the GitHub App has access to it.</p>
          {!audit.workflowsWriteEnabled && canManage(organization?.role) && <a className="button button-outline" href={"/api/organizations/" + encodeURIComponent(organizationId) + "/github-app/install"}>Update GitHub App permissions</a>}
        </section>
      )}

      {audit?.status === "ready" && (
        <section className="devobs-repository-list" aria-label="Repository audit results">
          <header><div><p className="ai-kicker">GITHUB INSTALLATION</p><h2>{audit.accountLogin}</h2></div><span className="ai-status is-enabled">Connected</span></header>
          {!audit.workflowsWriteEnabled && (
            <p className="ai-message ai-message-error" role="status">
              Read-only audits work with the selected permissions. Creating draft PRs that add GitHub Actions workflow files also requires Workflows: write.
              {canManage(organization?.role) && <> <a href={"/api/organizations/" + encodeURIComponent(organizationId) + "/github-app/install"}>Update GitHub App permissions</a></>}
            </p>
          )}
          {audit.repositories.map((repo) => (
            <article className="devobs-repository-card" key={repo.integrationId}>
              <div className="devobs-repository-heading"><div><h3>{repo.name}</h3><a href={repo.repositoryUrl} target="_blank" rel="noreferrer">{repo.repositoryUrl}</a></div><span className={`ai-status ${repo.status === "already-integrated" ? "is-enabled" : "is-muted"}`}>{repo.status.replaceAll("-", " ")}</span></div>
              <p>{repo.message}</p>
              {repo.detectedStacks.length > 0 && <p className="ai-help">Detected checks: {repo.detectedStacks.join(", ")}</p>}
              {repo.repairable && canManage(organization?.role) && (
                <button className="button button-primary" type="button" disabled={busy} onClick={() => void createRepair(repo.integrationId)}>Create isolated repair PR</button>
              )}
            </article>
          ))}
        </section>
      )}

      {organization && canManage(organization.role) && audit?.status !== "not-configured" && audit?.status !== "not-connected" && (
        <form className="devobs-repository-form" onSubmit={(event) => void connectRepository(event)}>
          <div><p className="ai-kicker">REPOSITORY ACCESS</p><h2>Add a GitHub repository</h2><p className="ai-help">The repository must be accessible to the connected GitHub App. No personal access token is requested.</p></div>
          <label htmlFor="devobs-repository-name">Display name</label>
          <input id="devobs-repository-name" value={repositoryName} onChange={(event) => setRepositoryName(event.target.value)} maxLength={120} required />
          <label htmlFor="devobs-repository-url">Repository URL</label>
          <input id="devobs-repository-url" type="url" pattern="https://github\.com/[^/]+/[^/]+/?" placeholder="https://github.com/owner/repository" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} maxLength={2048} required />
          <button className="button button-outline" type="submit" disabled={busy}>{busy ? "Saving…" : "Add repository"}</button>
        </form>
      )}
      {organization && !canManage(organization.role) && audit?.status === "ready" && <p className="ai-help">Only an organization owner or admin can add repositories or create repair pull requests.</p>}
    </section>
  );
}

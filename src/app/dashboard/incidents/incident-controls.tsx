"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Organization = { id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" };
type Alert = { id: string; title: string; severity: "INFO" | "WARNING" | "CRITICAL"; status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED"; openedAt: string };
type Incident = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "RESOLVED";
  openedAt: string;
  resolvedAt: string | null;
  alertLinks: Array<{
    alertId: string;
    linkReason: string;
    linkedAt: string;
    alert: { title: string; severity: Alert["severity"]; status: Alert["status"]; openedAt: string; externalId: string | null; source: { name: string; provider: string } | null };
  }>;
};
type ApiList<T> = { items: T[]; nextCursor: string | null; error?: string };
type PageableResource = "alerts" | "incidents";

const canWrite = (role: Organization["role"] | undefined) => role !== undefined && role !== "VIEWER";

async function readPayload<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

function appendUnique<T extends { id: string }>(current: T[], incoming: T[]) {
  const known = new Set(current.map(({ id }) => id));
  return [...current, ...incoming.filter(({ id }) => !known.has(id))];
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Time unavailable" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default function IncidentControls({ organizations }: { organizations: Organization[] }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alertsNextCursor, setAlertsNextCursor] = useState<string | null>(null);
  const [incidentsNextCursor, setIncidentsNextCursor] = useState<string | null>(null);
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(Boolean(organizations.length));
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState<PageableResource | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeOrganization = useRef(organizationId);
  activeOrganization.current = organizationId;
  const organization = organizations.find(({ id }) => id === organizationId);

  useEffect(() => {
    if (!organizationId) {
      setAlerts([]);
      setIncidents([]);
      setAlertsNextCursor(null);
      setIncidentsNextCursor(null);
      setLoadingMore(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const encodedId = encodeURIComponent(organizationId);
    setLoading(true);
    setError("");
    setNotice("");
    setAlerts([]);
    setIncidents([]);
    setAlertsNextCursor(null);
    setIncidentsNextCursor(null);
    setLoadingMore(null);
    setSelectedAlertIds([]);
    setReasons({});
    void Promise.all([
      fetch(`/api/organizations/${encodedId}/alerts`, { cache: "no-store", signal: controller.signal }),
      fetch(`/api/organizations/${encodedId}/incidents`, { cache: "no-store", signal: controller.signal }),
    ]).then(async ([alertResponse, incidentResponse]) => {
      const [alertBody, incidentBody] = await Promise.all([
        readPayload<ApiList<Alert>>(alertResponse), readPayload<ApiList<Incident>>(incidentResponse),
      ]);
      if (!active) return;
      if (!alertResponse.ok || !alertBody) throw new Error(alertBody?.error ?? "Could not load alerts.");
      if (!incidentResponse.ok || !incidentBody) throw new Error(incidentBody?.error ?? "Could not load incident records.");
      setAlerts(alertBody.items);
      setIncidents(incidentBody.items);
      setAlertsNextCursor(alertBody.nextCursor);
      setIncidentsNextCursor(incidentBody.nextCursor);
    }).catch((cause: unknown) => {
      if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load incident records.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; controller.abort(); };
  }, [organizationId]);

  async function loadOlder(resource: PageableResource) {
    const cursor = resource === "alerts" ? alertsNextCursor : incidentsNextCursor;
    if (!organizationId || !cursor || loadingMore || busy) return;
    const requestedOrganizationId = organizationId;
    setLoadingMore(resource);
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(requestedOrganizationId)}/${resource}?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      const payload = await readPayload<ApiList<Alert | Incident>>(response);
      if (!response.ok || !payload || !Array.isArray(payload.items)) {
        throw new Error(payload?.error ?? `Could not load older ${resource}.`);
      }
      if (activeOrganization.current !== requestedOrganizationId) return;
      if (resource === "alerts") {
        setAlerts((current) => appendUnique(current, payload.items as Alert[]));
        setAlertsNextCursor(payload.nextCursor);
      } else {
        setIncidents((current) => appendUnique(current, payload.items as Incident[]));
        setIncidentsNextCursor(payload.nextCursor);
      }
    } catch (cause) {
      if (activeOrganization.current === requestedOrganizationId) {
        setError(cause instanceof Error ? cause.message : `Could not load older ${resource}.`);
      }
    } finally {
      if (activeOrganization.current === requestedOrganizationId) setLoadingMore(null);
    }
  }

  function toggleAlert(alertId: string) {
    setSelectedAlertIds((current) => current.includes(alertId)
      ? current.filter((id) => id !== alertId)
      : current.length < 25 ? [...current, alertId] : current);
  }

  async function createIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !selectedAlertIds.length || !canWrite(organization?.role)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/incidents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          alerts: selectedAlertIds.map((alertId) => ({ alertId, reason: reasons[alertId] ?? "" })),
        }),
      });
      const payload = await readPayload<{ item?: Incident; error?: string }>(response);
      if (!response.ok || !payload?.item) throw new Error(payload?.error ?? "Incident could not be created.");
      if (activeOrganization.current !== organizationId) return;
      setIncidents((current) => [payload.item!, ...current].slice(0, 25));
      setIncidentsNextCursor(payload.item.id);
      setTitle("");
      setDescription("");
      setSelectedAlertIds([]);
      setReasons({});
      setNotice("Incident recorded. Alert links remain operator-provided context, not proof of a common cause.");
      try {
        const refreshResponse = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/incidents`, { cache: "no-store" });
        const refreshed = await readPayload<ApiList<Incident>>(refreshResponse);
        if (refreshResponse.ok && refreshed && activeOrganization.current === organizationId) {
          setIncidents(refreshed.items);
          setIncidentsNextCursor(refreshed.nextCursor);
        } else if (activeOrganization.current === organizationId) {
          setNotice("Incident was saved. Reload the page if the latest list does not appear.");
        }
      } catch {
        if (activeOrganization.current === organizationId) {
          setNotice("Incident was saved. Reload the page if the latest list does not appear.");
        }
      }
    } catch (cause) {
      if (activeOrganization.current === organizationId) setError(cause instanceof Error ? cause.message : "Incident could not be created.");
    } finally {
      if (activeOrganization.current === organizationId) setBusy(false);
    }
  }

  async function changeStatus(incident: Incident) {
    if (!organizationId || !canWrite(organization?.role)) return;
    setBusy(true);
    setError("");
    setNotice("");
    const status = incident.status === "OPEN" ? "RESOLVED" : "OPEN";
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/incidents/${encodeURIComponent(incident.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await readPayload<{ item?: Incident; error?: string }>(response);
      if (!response.ok || !payload?.item) throw new Error(payload?.error ?? "Incident status could not be changed.");
      if (activeOrganization.current === organizationId) {
        setIncidents((current) => current.map((item) => item.id === incident.id ? payload.item! : item));
      }
    } catch (cause) {
      if (activeOrganization.current === organizationId) setError(cause instanceof Error ? cause.message : "Incident status could not be changed.");
    } finally {
      if (activeOrganization.current === organizationId) setBusy(false);
    }
  }

  return (
    <section className="ai-console-content" aria-label="Organization incidents">
      <div className="ai-console-toolbar">
        <label htmlFor="incident-organization">Organization</label>
        <select id="incident-organization" value={organizationId} disabled={busy || loadingMore !== null} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <span className="ai-role-badge">{organization?.role ?? "No organization"}</span>
      </div>
      {error && <p className="ai-message ai-message-error" role="alert">{error}</p>}
      {notice && <p className="ai-message ai-message-success" role="status">{notice}</p>}
      {loading && <p className="ai-loading" role="status">Loading organization alerts and incidents…</p>}
      {!loading && organizations.length === 0 && <section className="ai-empty-state"><h2>No active organization</h2><p>Create or join an organization to view monitoring records.</p></section>}

      {!loading && organizations.length > 0 && canWrite(organization?.role) && (
        <form className="incident-create-form" onSubmit={(event) => void createIncident(event)}>
          <div>
            <p className="ai-kicker">MANUAL OPERATOR RECORD</p>
            <h2>Create incident</h2>
            <p>Choose related alerts and explain each relationship. The system does not group alerts automatically or infer a cause.</p>
          </div>
          <label htmlFor="incident-title">Title</label>
          <input id="incident-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required />
          <label htmlFor="incident-description">Summary (optional)</label>
          <textarea id="incident-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} />
          <fieldset>
            <legend>Alerts to link (up to 25)</legend>
            {alerts.length === 0 && <p>No alerts are available to link.</p>}
            {alerts.map((alert) => {
              const selected = selectedAlertIds.includes(alert.id);
              return (
                <article className="incident-alert-option" key={alert.id}>
                  <label>
                    <input type="checkbox" checked={selected} disabled={busy || (!selected && selectedAlertIds.length >= 25)} onChange={() => toggleAlert(alert.id)} />
                    <span><strong>{alert.title}</strong><small>{alert.severity} · {alert.status} · {formatTime(alert.openedAt)}</small></span>
                  </label>
                  {selected && <textarea aria-label={`Why link ${alert.title}`} placeholder="Why is this alert linked? (at least 8 characters)" value={reasons[alert.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [alert.id]: event.target.value }))} maxLength={500} rows={2} required />}
                </article>
              );
            })}
            {alertsNextCursor && <button className="button button-outline" type="button" disabled={busy || loadingMore !== null} onClick={() => void loadOlder("alerts")}>{loadingMore === "alerts" ? "Loading older alerts…" : "Load older alerts"}</button>}
          </fieldset>
          <button className="button button-primary" type="submit" disabled={busy || loadingMore !== null || !selectedAlertIds.length}>{busy ? "Saving…" : "Create incident record"}</button>
        </form>
      )}
      {!loading && organizations.length > 0 && !canWrite(organization?.role) && <p className="ai-help">This membership is read-only. An owner, admin, or member can create or resolve incidents.</p>}

      <section className="incident-list" aria-labelledby="incident-list-heading">
        <header><div><p className="ai-kicker">TENANT-SCOPED RECORDS</p><h2 id="incident-list-heading">Recent incidents</h2></div><span className="ai-count">{incidents.length} shown</span></header>
        {!loading && incidents.length === 0 && <p className="ai-help">No incident records yet. Alerts remain available in the alert analysis workspace.</p>}
        {incidents.map((incident) => (
          <article className="incident-card" key={incident.id}>
            <header><div><h3>{incident.title}</h3><p>{incident.description || "No summary provided."}</p></div><span className={`ai-status ${incident.status === "OPEN" ? "is-enabled" : "is-muted"}`}>{incident.status}</span></header>
            <p className="ai-help">Opened {formatTime(incident.openedAt)}{incident.resolvedAt ? ` · Resolved ${formatTime(incident.resolvedAt)}` : ""}</p>
            <ul>{incident.alertLinks.map(({ alertId, linkReason, alert }) => (
              <li key={alertId}><strong>{alert.title}</strong> · {alert.severity} · {alert.source?.name ?? "No source"}{alert.externalId ? ` · fingerprint ${alert.externalId}` : ""}<br /><span>{linkReason}</span></li>
            ))}</ul>
            {canWrite(organization?.role) && <button className="button button-outline" type="button" disabled={busy} onClick={() => void changeStatus(incident)}>{incident.status === "OPEN" ? "Resolve incident" : "Reopen incident"}</button>}
          </article>
        ))}
        {incidentsNextCursor && <button className="button button-outline" type="button" disabled={busy || loadingMore !== null} onClick={() => void loadOlder("incidents")}>{loadingMore === "incidents" ? "Loading older incidents…" : "Load older incidents"}</button>}
      </section>
      <p className="incident-causality-note">A shared incident record groups operator-selected signals for review. It does not prove the alerts share a cause or correlate them to a deployment.</p>
    </section>
  );
}

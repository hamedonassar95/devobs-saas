"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAiDashboardAccess } from "@/lib/analysis/dashboard-access";
import {
  ALERT_EVIDENCE_FIELD_LABELS,
  isAlertEvidenceScope,
  MISSING_SIGNAL_LABELS,
} from "@/lib/analysis/evidence";

type Organization = { id: string; name: string; role: string };
type UsageWindow = {
  requestsReserved: number;
  succeeded: number;
  failed: number;
  outcomesPending: number;
  averageLatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costEstimateUsd: number | null;
  usageCoveragePercent: number | null;
  costEstimateComplete: boolean;
  pricingCheckedOn: string;
  window: string;
};
type AiSettings = {
  enabled: boolean;
  hasAiPlan: boolean;
  providerAvailable: boolean;
  provider: string;
  freePlanConfirmed: boolean;
  dailyRequestLimitPerOrganization: number;
  sharedDailyRequestLimit: number;
  usageToday: UsageWindow;
  usageThisMonth: UsageWindow;
  dataHandling: string;
};
type Alert = {
  id: string;
  title: string;
  description: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  openedAt: string;
};
type AnalysisItem = {
  id: string;
  alertId: string;
  summary: string;
  details: unknown;
  model: string;
  createdAt: string;
};
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function errorFrom(body: unknown, fallback: string): string {
  return isRecord(body) && typeof body.error === "string" ? body.error : fallback;
}

function formatCost(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatUtc(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown time" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatLatency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Not reported";
  return value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(1)} s`;
}

function formatCoverage(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "Not available" : `${Math.round(value)}%`;
}

function analysisDetails(value: unknown) {
  if (!isRecord(value)) return { likelyCause: null, confidence: null, nextSteps: [], note: null, evidenceScope: null };
  return {
    likelyCause: typeof value.likelyCause === "string" ? value.likelyCause : null,
    confidence: typeof value.confidence === "string" ? value.confidence : null,
    nextSteps: Array.isArray(value.nextSteps)
      ? value.nextSteps.filter((step): step is string => typeof step === "string")
      : [],
    note: typeof value.note === "string" ? value.note : null,
    evidenceScope: isAlertEvidenceScope(value.evidenceScope) ? value.evidenceScope : null,
  };
}

export default function AiControls({ organizations }: { organizations: Organization[] }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  const [loading, setLoading] = useState(Boolean(organizations.length));
  const [alertsMessage, setAlertsMessage] = useState("");
  const [analysesMessage, setAnalysesMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  const organization = organizations.find((item) => item.id === organizationId);
  const access = useMemo(() => getAiDashboardAccess(organization?.role ?? "VIEWER", {
    providerAvailable: settings?.providerAvailable ?? false,
    freePlanConfirmed: settings?.freePlanConfirmed ?? false,
    enabled: settings?.enabled ?? false,
    hasAiPlan: settings?.hasAiPlan ?? false,
  }), [organization?.role, settings?.providerAvailable, settings?.freePlanConfirmed, settings?.enabled, settings?.hasAiPlan]);
  const analysisByAlert = useMemo(() => {
    const result = new Map<string, AnalysisItem>();
    for (const item of analyses) {
      if (!result.has(item.alertId)) result.set(item.alertId, item);
    }
    return result;
  }, [analyses]);

  useEffect(() => {
    if (!organizationId) {
      setSettings(null);
      setAlerts([]);
      setAnalyses([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setSettings(null);
    setAlerts([]);
    setAnalyses([]);
    setError("");
    setNotice("");
    setAlertsMessage("");
    setAnalysesMessage("");

    async function loadOrganization() {
      const encodedId = encodeURIComponent(organizationId);
      const [settingsResponse, alertsResponse, analysesResponse] = await Promise.all([
        fetch(`/api/organizations/${encodedId}/ai-settings`, { signal: controller.signal, cache: "no-store" }),
        fetch(`/api/organizations/${encodedId}/alerts`, { signal: controller.signal, cache: "no-store" }),
        fetch(`/api/organizations/${encodedId}/analysis-results`, { signal: controller.signal, cache: "no-store" }),
      ]);
      const [settingsBody, alertsBody, analysesBody] = await Promise.all([
        readJson(settingsResponse), readJson(alertsResponse), readJson(analysesResponse),
      ]);
      if (!active) return;

      if (!settingsResponse.ok || !isRecord(settingsBody)) {
        throw new Error(errorFrom(settingsBody, "Unable to load AI settings."));
      }
      setSettings(settingsBody as unknown as AiSettings);

      if (alertsResponse.ok && isRecord(alertsBody) && Array.isArray(alertsBody.items)) {
        setAlerts(alertsBody.items as Alert[]);
      } else {
        setAlertsMessage(errorFrom(alertsBody, "Unable to load alerts."));
      }

      if (analysesResponse.ok && isRecord(analysesBody) && Array.isArray(analysesBody.items)) {
        setAnalyses(analysesBody.items as AnalysisItem[]);
      } else {
        setAnalysesMessage(errorFrom(analysesBody, "Unable to load saved analyses."));
      }
    }

    void loadOrganization()
      .catch((cause: unknown) => {
        if (active && !controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load this organization.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [organizationId]);

  async function changeAiSetting() {
    if (!organizationId || !settings) return;
    const nextEnabled = !settings.enabled;
    if (nextEnabled ? !access.canEnable : !access.canDisable) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/ai-settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const body = await readJson(response);
      if (!response.ok || !isRecord(body) || typeof body.enabled !== "boolean") {
        throw new Error(errorFrom(body, "Unable to update the AI setting."));
      }
      setSettings((current) => current ? { ...current, enabled: body.enabled as boolean } : current);
      setNotice(nextEnabled
        ? "AI analysis is enabled for this organization. A provider request is made only when an authorized member asks to analyze an alert."
        : "AI analysis is off for this organization. Alert analysis will use local rules.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the AI setting.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeAlert(alertId: string) {
    if (!organizationId || !access.canAnalyze) return;
    setBusyAlertId(alertId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/alerts/${encodeURIComponent(alertId)}/analysis`,
        { method: "POST" },
      );
      const body = await readJson(response);
      if (!response.ok || !isRecord(body) || !isRecord(body.item)) {
        throw new Error(errorFrom(body, "Unable to analyze this alert."));
      }
      const item = body.item as unknown as AnalysisItem;
      setAnalyses((current) => [item, ...current.filter((entry) => entry.id !== item.id && entry.alertId !== item.alertId)]);
      setNotice(item.model.startsWith("local-rules")
        ? "Local deterministic guidance is shown. No Cloudflare inference result was saved for this request."
        : "Cloudflare analysis was saved. Review it as advisory guidance and verify the evidence before acting.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to analyze this alert.");
    } finally {
      setBusyAlertId(null);
    }
  }

  if (!organizations.length) {
    return (
      <section className="ai-empty-state">
        <h2>No organization is linked to this account</h2>
        <p>Ask an organization owner to add your account. New organizations are created during account registration.</p>
      </section>
    );
  }

  return (
    <div className="ai-console-content">
      <div className="ai-console-toolbar">
        <label htmlFor="ai-organization">Organization</label>
        <select id="ai-organization" value={organizationId} disabled={busy || busyAlertId !== null} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <span className="ai-role-badge">{organization?.role ?? "Member"}</span>
        <Link className="ai-inline-link" href="/billing">Manage plan</Link>
      </div>

      {error && <p className="ai-message ai-message-error" role="alert">{error}</p>}
      {notice && <p className="ai-message ai-message-success" role="status">{notice}</p>}

      {loading ? (
        <p className="ai-loading" role="status">Loading organization status…</p>
      ) : settings ? (
        <>
          <section className="ai-panel" aria-labelledby="ai-settings-heading">
            <div className="ai-panel-heading">
              <div>
                <p className="ai-kicker">PROVIDER CONTROL</p>
                <h2 id="ai-settings-heading">Cloudflare Workers AI</h2>
              </div>
              <span className={`ai-status ${settings.enabled && settings.providerAvailable ? "is-enabled" : "is-muted"}`}>
                {settings.enabled && settings.providerAvailable ? "Opted in" : "Local guidance"}
              </span>
            </div>

            <p className="ai-description">
              {settings.providerAvailable
                ? "The application operator has configured the provider and confirmed the account plan. This does not validate the token or prove a model request has succeeded. Organization opt-in is still required."
                : "The provider is not available from application configuration. Requests use deterministic local guidance and do not call Cloudflare."}
            </p>

            <div className="ai-opt-in-row">
              <div>
                <h3>Allow provider analysis for this organization</h3>
                <p>When enabled, an authorized member must still request analysis for each alert.</p>
              </div>
              <button
                type="button"
                className={`ai-toggle ${settings.enabled ? "is-on" : ""}`}
                role="switch"
                aria-checked={settings.enabled}
                aria-label="Allow Cloudflare Workers AI analysis for this organization"
                disabled={busy || !(settings.enabled ? access.canDisable : access.canEnable)}
                onClick={() => void changeAiSetting()}
              >
                <span className="ai-toggle-track" aria-hidden="true"><span /></span>
                <span className="ai-toggle-label">{settings.enabled ? "On" : "Off"}</span>
              </button>
            </div>

            {!access.canManage && <p className="ai-help">Only an organization owner or admin can change this setting.</p>}
            {!settings.hasAiPlan && <p className="ai-help">Alert analysis requires an active or trialing Full plan. <Link href="/billing">Review plans</Link>.</p>}
            {!settings.providerAvailable && <p className="ai-help">The operator must configure the provider, confirm its plan, and keep the global AI switch on before this organization can opt in.</p>}
            {settings.enabled && !settings.providerAvailable && <p className="ai-help">The saved organization opt-in is currently inactive because the global provider configuration is unavailable. An owner or admin can turn the opt-in off here.</p>}
            <p className="ai-disclosure">
              <strong>Data handling:</strong> {settings.enabled && settings.providerAvailable
                ? settings.dataHandling
                : "New analysis requests stay local while organization opt-in or provider configuration is off."} Redaction is pattern-based and may not remove every sensitive value. Do not send secrets or personal data in alert text.
            </p>
            <p className="ai-disclosure">Analysis is advisory only. It does not run commands, change infrastructure, or approve a recovery. <a href="https://developers.cloudflare.com/workers-ai/platform/data-usage/" target="_blank" rel="noreferrer">Cloudflare data usage</a>.</p>
          </section>

          <section className="ai-panel" aria-labelledby="ai-usage-heading">
            <div className="ai-panel-heading">
              <div>
                <p className="ai-kicker">BOUNDED USAGE</p>
                <h2 id="ai-usage-heading">Usage and estimates</h2>
              </div>
              <a href="https://developers.cloudflare.com/workers-ai/platform/pricing/" target="_blank" rel="noreferrer">Provider pricing ↗</a>
            </div>
            <div className="ai-metrics-grid">
              <div className="ai-metric"><span>AI requests reserved today</span><strong>{settings.usageToday.requestsReserved} / {settings.dailyRequestLimitPerOrganization}</strong></div>
              <div className="ai-metric"><span>Shared application cap</span><strong>{settings.sharedDailyRequestLimit} / day</strong></div>
              <div className="ai-metric"><span>Today estimate</span><strong>{formatCost(settings.usageToday.costEstimateUsd)}</strong></div>
              <div className="ai-metric"><span>This month estimate</span><strong>{formatCost(settings.usageThisMonth.costEstimateUsd)}</strong></div>
              <div className="ai-metric"><span>Provider calls</span><strong>{settings.usageToday.succeeded} succeeded · {settings.usageToday.failed} failed</strong></div>
              <div className="ai-metric"><span>Token usage reported</span><strong>{settings.usageThisMonth.inputTokens + settings.usageThisMonth.outputTokens}</strong></div>
              <div className="ai-metric"><span>Pending outcomes</span><strong>{settings.usageToday.outcomesPending}</strong></div>
              <div className="ai-metric"><span>Average latency today</span><strong>{formatLatency(settings.usageToday.averageLatencyMs)}</strong></div>
              <div className="ai-metric"><span>Today&apos;s token coverage</span><strong>{formatCoverage(settings.usageToday.usageCoveragePercent)}</strong></div>
            </div>
            <p className="ai-help">
              Cloudflare currently publishes 10,000 free Neurons per account per day; this allowance is shared with other account workloads. The app does not meter Neurons. Estimates use the pinned model&apos;s published token rates when usage is reported, exclude free allocation and other workloads, and are not invoices. Cloudflare billing is authoritative. Rates checked {settings.usageThisMonth.pricingCheckedOn}.
            </p>
          </section>

          <section className="ai-panel" aria-labelledby="ai-alerts-heading">
            <div className="ai-panel-heading">
              <div>
                <p className="ai-kicker">ALERT TRIAGE</p>
                <h2 id="ai-alerts-heading">Recent alerts</h2>
              </div>
              <span className="ai-count">{alerts.length}</span>
            </div>
            {alertsMessage ? (
              <p className="ai-message ai-message-error">{alertsMessage} <Link href="/billing">View plans</Link></p>
            ) : alerts.length === 0 ? (
              <div className="ai-empty-state">
                <h3>No alerts are available for this organization</h3>
                <p>Connect an Alertmanager or Grafana webhook and send an alert before requesting analysis.</p>
                <p className="ai-help">Monitoring-source setup is currently managed through the authenticated API. The webhook token is shown only once when a source is created.</p>
              </div>
            ) : (
              <ul className="ai-alert-list">
                {alerts.map((alert) => {
                  const analysis = analysisByAlert.get(alert.id);
                  const details = analysis ? analysisDetails(analysis.details) : null;
                  const localResult = analysis?.model.startsWith("local-rules") ?? false;
                  return (
                    <li className="ai-alert-card" key={alert.id}>
                      <div className="ai-alert-header">
                        <div>
                          <div className="ai-alert-tags">
                            <span className={`ai-severity severity-${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                            <span className="ai-alert-status">{alert.status}</span>
                          </div>
                          <h3>{alert.title}</h3>
                          <time dateTime={alert.openedAt}>{formatUtc(alert.openedAt)}</time>
                        </div>
                        <button
                          className="button button-primary ai-analyze-button"
                          type="button"
                          disabled={!access.canAnalyze || busyAlertId !== null}
                          onClick={() => void analyzeAlert(alert.id)}
                        >
                          {busyAlertId === alert.id ? "Analyzing…" : localResult || !settings.enabled || !settings.providerAvailable ? "Get local guidance" : "Analyze with AI"}
                        </button>
                      </div>
                      {alert.description && <p className="ai-alert-description">{alert.description}</p>}
                      {!access.canAnalyze && organization?.role === "VIEWER" && <p className="ai-help">View-only members cannot request alert analysis.</p>}
                      {analysis && details && (
                        <div className="ai-analysis-result" aria-label="Saved analysis result">
                          <div className="ai-analysis-result-heading">
                            <strong>{localResult ? "Local rules" : "Cloudflare AI advisory"}</strong>
                            <span>{analysis.model}</span>
                          </div>
                          <p>{analysis.summary}</p>
                          {details.likelyCause && <p><strong>Possible cause:</strong> {details.likelyCause}</p>}
                          {details.confidence && <p><strong>Confidence:</strong> {details.confidence}</p>}
                          {details.nextSteps.length > 0 && <ul>{details.nextSteps.map((step, index) => <li key={`${analysis.id}-${index}`}>{step}</li>)}</ul>}
                          {details.evidenceScope ? (
                            <section className="ai-evidence-scope" aria-label="Analysis evidence scope">
                              <h4>Evidence scope</h4>
                              <div className="ai-evidence-scope-grid">
                                <div>
                                  <strong>Available alert fields</strong>
                                  <ul>{details.evidenceScope.availableFields.map((field) => <li key={field}>{ALERT_EVIDENCE_FIELD_LABELS[field]}</li>)}</ul>
                                </div>
                                <div>
                                  <strong>Not linked to this alert</strong>
                                  <ul>{details.evidenceScope.missingSignals.map((signal) => <li key={signal}>{MISSING_SIGNAL_LABELS[signal]}</li>)}</ul>
                                </div>
                              </div>
                              <p className="ai-help">This is one alert record. Its fields do not independently confirm a cause.</p>
                            </section>
                          ) : <p className="ai-help">Evidence scope is missing or invalid for this saved result.</p>}
                          {details.note && <p className="ai-help">{details.note}</p>}
                          <time dateTime={analysis.createdAt}>{formatUtc(analysis.createdAt)}</time>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {analysesMessage && <p className="ai-help">Saved analysis history: {analysesMessage}</p>}
          </section>
        </>
      ) : <p className="ai-message ai-message-error">AI settings could not be loaded. Try again or check the deployment health endpoint.</p>}
    </div>
  );
}

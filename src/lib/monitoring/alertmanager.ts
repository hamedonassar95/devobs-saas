import { createHash } from "node:crypto";
import { readBoundedJson } from "@/lib/http/bounded-json";

export type IncomingAlert = {
  externalId: string;
  title: string;
  description: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "RESOLVED";
  openedAt: Date;
  resolvedAt: Date | null;
};

export class MonitoringPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonitoringPayloadError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function parsedDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function mapSeverity(value: unknown): IncomingAlert["severity"] {
  switch (typeof value === "string" ? value.toLowerCase() : "") {
    case "critical":
    case "fatal":
    case "error":
      return "CRITICAL";
    case "warning":
    case "warn":
      return "WARNING";
    default:
      return "INFO";
  }
}

function fallbackFingerprint(labels: Record<string, unknown>, startsAt: Date | null): string {
  const stableLabels = Object.fromEntries(Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)));
  return createHash("sha256")
    .update(JSON.stringify(stableLabels))
    .update(startsAt?.toISOString() ?? "")
    .digest("hex");
}

export function parseAlertmanagerPayload(value: unknown): IncomingAlert[] {
  const payload = record(value);
  if (!payload || !Array.isArray(payload.alerts) || payload.alerts.length > 100) {
    throw new MonitoringPayloadError("Expected a JSON webhook payload containing no more than 100 alerts.");
  }

  const defaultStatus = boundedText(payload.status, 20)?.toLowerCase();
  return payload.alerts.map((value, index) => {
    const alert = record(value);
    const labels = record(alert?.labels) ?? {};
    const annotations = record(alert?.annotations) ?? {};
    if (!alert) throw new MonitoringPayloadError(`Alert ${index + 1} must be an object.`);

    const startsAt = parsedDate(alert.startsAt);
    const endsAt = parsedDate(alert.endsAt);
    const rawStatus = (boundedText(alert.status, 20) ?? defaultStatus ?? "firing").toLowerCase();
    const status = rawStatus === "resolved" ? "RESOLVED" : "OPEN";
    const title = boundedText(labels.alertname, 200)
      ?? boundedText(annotations.summary, 200)
      ?? boundedText(annotations.title, 200)
      ?? "Monitoring alert";
    const description = boundedText(annotations.description, 10_000)
      ?? boundedText(annotations.message, 10_000)
      ?? boundedText(annotations.summary, 10_000);
    const externalId = boundedText(alert.fingerprint, 255)
      ?? boundedText(alert.uid, 255)
      ?? fallbackFingerprint(labels, startsAt);

    return {
      externalId,
      title,
      description,
      severity: mapSeverity(labels.severity),
      status,
      openedAt: startsAt ?? new Date(),
      resolvedAt: status === "RESOLVED" ? endsAt ?? new Date() : null,
    };
  });
}

export async function readJsonBodyLimited(request: Request, maxBytes: number): Promise<unknown> {
  const body = await readBoundedJson(request, maxBytes);
  if (body && "tooLarge" in body) throw new MonitoringPayloadError("Webhook request is too large.");
  if (!body) throw new MonitoringPayloadError("Webhook request body must be valid JSON.");
  return body.data;
}

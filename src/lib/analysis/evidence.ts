export type AlertEvidenceField =
  | "title"
  | "description"
  | "severity"
  | "status"
  | "monitoringProvider";

export type MissingSignal = "telemetry" | "ciRuns" | "deployments";

export type AlertEvidenceScope = {
  basis: "single-alert";
  availableFields: AlertEvidenceField[];
  missingSignals: MissingSignal[];
};

export type AlertEvidenceInput = {
  title: string;
  description: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  sourceProvider?: "PROMETHEUS" | "GRAFANA" | null;
};

const ALERT_EVIDENCE_FIELDS = new Set<AlertEvidenceField>([
  "title",
  "description",
  "severity",
  "status",
  "monitoringProvider",
]);

const MISSING_SIGNALS = new Set<MissingSignal>(["telemetry", "ciRuns", "deployments"]);

export const ALERT_EVIDENCE_FIELD_LABELS: Record<AlertEvidenceField, string> = {
  title: "Alert title",
  description: "Alert description",
  severity: "Severity",
  status: "Alert status",
  monitoringProvider: "Monitoring provider",
};

export const MISSING_SIGNAL_LABELS: Record<MissingSignal, string> = {
  telemetry: "Linked telemetry samples",
  ciRuns: "Linked CI runs",
  deployments: "Linked deployments",
};

/** Describe the alert fields available to analysis without copying customer text. */
export function buildAlertEvidenceScope(alert: AlertEvidenceInput): AlertEvidenceScope {
  const availableFields: AlertEvidenceField[] = ["title"];
  if (alert.description?.trim()) availableFields.push("description");
  availableFields.push("severity", "status");
  if (alert.sourceProvider) availableFields.push("monitoringProvider");

  return {
    basis: "single-alert",
    availableFields,
    missingSignals: ["telemetry", "ciRuns", "deployments"],
  };
}

/** Validate JSON persisted before the evidence-scope contract was introduced. */
export function isAlertEvidenceScope(value: unknown): value is AlertEvidenceScope {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.basis !== "single-alert" || !Array.isArray(record.availableFields) || !Array.isArray(record.missingSignals)) {
    return false;
  }
  const validFields = record.availableFields.length > 0
    && record.availableFields.every((field) => typeof field === "string" && ALERT_EVIDENCE_FIELDS.has(field as AlertEvidenceField))
    && new Set(record.availableFields).size === record.availableFields.length;
  const validMissingSignals = record.missingSignals.length === MISSING_SIGNALS.size
    && record.missingSignals.every((signal) => typeof signal === "string" && MISSING_SIGNALS.has(signal as MissingSignal))
    && new Set(record.missingSignals).size === record.missingSignals.length;
  return validFields && validMissingSignals;
}

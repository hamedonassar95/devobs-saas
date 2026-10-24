import { CLOUDFLARE_ANALYSIS_MODEL_ID } from "./cloudflare";

const LEGACY_CONFIDENCE_NOTE = "This saved alert-only analysis had no linked corroborating evidence; high confidence is displayed as medium.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize legacy persisted alert-only responses at the API boundary without rewriting stored data. */
export function normalizeAlertOnlyAnalysis<T>(value: T): T {
  if (!isRecord(value) || value.model !== CLOUDFLARE_ANALYSIS_MODEL_ID || !isRecord(value.details)) return value;
  if (value.details.engine !== "cloudflare-workers-ai" || value.details.confidence !== "high") return value;

  const existingNote = typeof value.details.note === "string" ? value.details.note.trim() : "";
  return {
    ...value,
    details: {
      ...value.details,
      confidence: "medium",
      note: [existingNote, LEGACY_CONFIDENCE_NOTE].filter(Boolean).join(" "),
    },
  } as T;
}

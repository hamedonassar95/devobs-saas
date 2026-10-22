import {
  analyzeAlertWithCloudflare,
  CLOUDFLARE_ANALYSIS_MODEL_ID,
  getCloudflareWorkersAiConfig,
  UnsafeCloudflareAnalysisError,
  type AlertForAiAnalysis,
  type CloudflareAnalysis,
  type CloudflareEnvironment,
} from "@/lib/analysis/cloudflare";
import { analyzeAlertWithLocalRules, type RuleBasedAnalysis } from "@/lib/analysis/rules";
import type { AiTokenUsage } from "@/lib/analysis/usage";

export type StoredAlertAnalysis = {
  summary: string;
  details: RuleBasedAnalysis["details"] | CloudflareAnalysis["details"];
  model: string;
  providerCall: {
    attempted: boolean;
    outcome: "succeeded" | "failed" | "not-used";
    durationMs: number;
    tokenUsage: AiTokenUsage | null;
  };
};

type AnalysisOptions = {
  env?: CloudflareEnvironment;
  fetcher?: typeof fetch;
};

export async function analyzeAlert(
  alert: AlertForAiAnalysis,
  organizationAiEnabled: boolean,
  options: AnalysisOptions = {},
): Promise<StoredAlertAnalysis> {
  const local = analyzeAlertWithLocalRules(alert);
  if (!organizationAiEnabled) {
    return {
      ...local,
      model: "local-rules-v1",
      providerCall: { attempted: false, outcome: "not-used", durationMs: 0, tokenUsage: null },
      details: {
        ...local.details,
        note: "Organization AI opt-in is disabled. Guidance was generated locally from fixed rules; no alert data left the application.",
      },
    };
  }

  const config = getCloudflareWorkersAiConfig(options.env);
  if (!config) {
    return {
      ...local,
      model: "local-rules-fallback",
      providerCall: { attempted: false, outcome: "not-used", durationMs: 0, tokenUsage: null },
      details: {
        ...local.details,
        note: "AI analysis is enabled for this organization, but the application provider is unavailable. Deterministic local guidance is returned without an external request.",
      },
    };
  }

  const startedAt = Date.now();
  try {
    const { tokenUsage, ...result } = await analyzeAlertWithCloudflare(alert, config, options.fetcher);
    return {
      ...result,
      model: CLOUDFLARE_ANALYSIS_MODEL_ID,
      providerCall: {
        attempted: true,
        outcome: "succeeded",
        durationMs: Math.max(0, Date.now() - startedAt),
        tokenUsage,
      },
    };
  } catch (error) {
    const outputRejected = error instanceof UnsafeCloudflareAnalysisError;
    return {
      ...local,
      model: "local-rules-fallback",
      providerCall: { attempted: true, outcome: "failed", durationMs: Math.max(0, Date.now() - startedAt), tokenUsage: null },
      details: {
        ...local.details,
        note: outputRejected
          ? "Cloudflare Workers AI output failed the local high-risk advice check. The response was discarded and deterministic local guidance was returned; no provider retry was made."
          : "Cloudflare Workers AI was unavailable. Deterministic local guidance is returned; no provider retry was made.",
      },
    };
  }
}

import {
  analyzeAlertWithCloudflare,
  CLOUDFLARE_ANALYSIS_MODEL_ID,
  getCloudflareWorkersAiConfig,
  type AlertForAiAnalysis,
  type CloudflareAnalysis,
  type CloudflareEnvironment,
} from "@/lib/analysis/cloudflare";
import { analyzeAlertWithLocalRules, type RuleBasedAnalysis } from "@/lib/analysis/rules";

export type StoredAlertAnalysis = {
  summary: string;
  details: RuleBasedAnalysis["details"] | CloudflareAnalysis["details"];
  model: string;
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
      details: {
        ...local.details,
        note: "AI analysis is enabled for this organization, but the application provider is unavailable. Deterministic local guidance is returned without an external request.",
      },
    };
  }

  try {
    const result = await analyzeAlertWithCloudflare(alert, config, options.fetcher);
    return { ...result, model: CLOUDFLARE_ANALYSIS_MODEL_ID };
  } catch {
    return {
      ...local,
      model: "local-rules-fallback",
      details: {
        ...local.details,
        note: "Cloudflare Workers AI was unavailable. Deterministic local guidance is returned; no provider retry was made.",
      },
    };
  }
}

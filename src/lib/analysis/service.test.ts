import { describe, expect, it, vi } from "vitest";
import { analyzeAlert } from "./service";

const alert = {
  title: "Database connection pool",
  description: "Connections are saturated.",
  severity: "CRITICAL" as const,
  status: "OPEN" as const,
};
const enabledEnv = {
  CLOUDFLARE_WORKERS_AI_ENABLED: "true",
  CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED: "true",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_API_TOKEN: "test-token",
};

describe("alert analysis selection", () => {
  it("keeps organization analysis local unless the organization opted in", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await analyzeAlert(alert, false, { env: enabledEnv, fetcher });

    expect(result.model).toBe("local-rules-v1");
    expect(result.providerCall).toEqual({ attempted: false, outcome: "not-used", durationMs: 0, tokenUsage: null });
    expect(result.details.note).toContain("opt-in is disabled");
    expect(result.details).toHaveProperty("evidenceScope", {
      availableFields: ["title", "description", "severity", "status"],
      missingSignals: ["telemetry", "ciRuns", "deployments"],
      basis: "single-alert",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses local rules without calling a provider when the global provider is not configured", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await analyzeAlert(alert, true, { env: {}, fetcher });

    expect(result.model).toBe("local-rules-fallback");
    expect(result.providerCall).toEqual({ attempted: false, outcome: "not-used", durationMs: 0, tokenUsage: null });
    expect(result.details.note).toContain("without an external request");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("marks which alert fields are available without implying corroborating evidence", async () => {
    const result = await analyzeAlert({
      title: "Database connection pool",
      description: null,
      severity: "WARNING",
      status: "OPEN",
      sourceProvider: "PROMETHEUS",
    }, false, { env: enabledEnv });

    expect(result.details).toHaveProperty("evidenceScope", {
      availableFields: ["title", "severity", "status", "monitoringProvider"],
      missingSignals: ["telemetry", "ciRuns", "deployments"],
      basis: "single-alert",
    });
  });

  it("returns deterministic guidance after one provider failure without retrying", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("provider error", { status: 503 }));
    const result = await analyzeAlert(alert, true, { env: enabledEnv, fetcher });

    expect(result.model).toBe("local-rules-fallback");
    expect(result.providerCall.attempted).toBe(true);
    expect(result.providerCall.outcome).toBe("failed");
    expect(result.details.note).toContain("no provider retry");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back locally when the provider returns high-risk mutation advice", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      result: {
        response: JSON.stringify({
          summary: "The deployment may have caused an outage.",
          likelyCause: "A pod is not serving requests.",
          confidence: "medium",
          nextSteps: ["Run kubectl delete pods in production now."],
        }),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await analyzeAlert(alert, true, { env: enabledEnv, fetcher });

    expect(result.model).toBe("local-rules-fallback");
    expect(result.providerCall).toMatchObject({ attempted: true, outcome: "failed", tokenUsage: null });
    expect(result.details.note).toContain("high-risk advice check");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("records successful provider-call outcome for usage metering", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      result: {
        response: JSON.stringify({
          summary: "Database connections are saturated.",
          likelyCause: "Connection pool exhaustion.",
          confidence: "medium",
          nextSteps: ["Check pool saturation and recent deployment changes."],
        }),
        usage: { prompt_tokens: 240, completion_tokens: 42, total_tokens: 282 },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await analyzeAlert(alert, true, { env: enabledEnv, fetcher });

    expect(result.model).toContain("cloudflare-workers-ai/");
    expect(result.providerCall.attempted).toBe(true);
    expect(result.providerCall.outcome).toBe("succeeded");
    expect(result.providerCall.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.providerCall.tokenUsage).toEqual({ promptTokens: 240, completionTokens: 42 });
    expect(result.details).toHaveProperty("evidenceScope", {
      availableFields: ["title", "description", "severity", "status"],
      missingSignals: ["telemetry", "ciRuns", "deployments"],
      basis: "single-alert",
    });
  });
});

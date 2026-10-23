import { describe, expect, it } from "vitest";
import { normalizeAlertOnlyAnalysis } from "./presentation";

describe("alert-only analysis presentation", () => {
  it("caps a saved Cloudflare result that predates the evidence policy", () => {
    const saved = {
      model: "cloudflare-workers-ai/@cf/meta/llama-3.1-8b-instruct-fp8",
      details: {
        engine: "cloudflare-workers-ai",
        confidence: "high",
        note: "AI-generated advisory only.",
      },
    };

    expect(normalizeAlertOnlyAnalysis(saved)).toEqual({
      model: saved.model,
      details: {
        ...saved.details,
        confidence: "medium",
        note: "AI-generated advisory only. This saved alert-only analysis had no linked corroborating evidence; high confidence is displayed as medium.",
      },
    });
  });

  it("leaves local, low-confidence, malformed, and unrelated analyses unchanged", () => {
    const unchanged = [
      { model: "local-rules-v1", details: { confidence: "high" } },
      { model: "cloudflare-workers-ai/@cf/meta/llama-3.1-8b-instruct-fp8", details: { confidence: "low" } },
      { model: "cloudflare-workers-ai/@cf/meta/llama-3.1-8b-instruct-fp8", details: null },
      { model: null, details: { engine: "other", confidence: "high" } },
    ];

    for (const item of unchanged) expect(normalizeAlertOnlyAnalysis(item)).toBe(item);
  });
});

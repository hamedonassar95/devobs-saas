import { describe, expect, it } from "vitest";
import {
  estimateAiCostNanoUsd,
  getDailyAiRequestLimit,
  getPlatformDailyAiRequestLimit,
  getUtcDayStart,
  summarizeAiCostEstimate,
} from "./usage";

describe("AI usage budget configuration", () => {
  it("uses a small default and accepts bounded positive integer overrides", () => {
    expect(getDailyAiRequestLimit({})).toBe(5);
    expect(getDailyAiRequestLimit({ CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_PER_ORG: "1" })).toBe(1);
    expect(getDailyAiRequestLimit({ CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_PER_ORG: "100" })).toBe(100);
  });

  it("rejects malformed or out-of-range limits", () => {
    for (const value of ["0", "101", "five", "1.5"]) {
      expect(getDailyAiRequestLimit({ CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_PER_ORG: value })).toBeNull();
    }
  });

  it("uses UTC midnight so tenants share an unambiguous daily window", () => {
    expect(getUtcDayStart(new Date("2026-10-20T23:59:59.999Z")).toISOString())
      .toBe("2026-10-20T00:00:00.000Z");
  });
});

describe("shared AI provider budget configuration", () => {
  it("defaults to a small platform-wide cap and accepts bounded overrides", () => {
    expect(getPlatformDailyAiRequestLimit({})).toBe(10);
    expect(getPlatformDailyAiRequestLimit({ CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_TOTAL: "1" })).toBe(1);
    expect(getPlatformDailyAiRequestLimit({ CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_TOTAL: "100" })).toBe(100);
  });

  it("fails closed for malformed or excessive shared limits", () => {
    for (const value of ["0", "101", "ten", "1.5"]) {
      expect(getPlatformDailyAiRequestLimit({ CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_TOTAL: value })).toBeNull();
    }
  });
});

describe("provider token and cost estimates", () => {
  it("uses the checked-in Cloudflare per-token rates without floating-point storage", () => {
    const cost = estimateAiCostNanoUsd({ promptTokens: 240, completionTokens: 42 });
    expect(cost).toBe(BigInt(48_534));
    expect(summarizeAiCostEstimate(1, 1, cost)).toEqual({
      costEstimateUsd: 0.000048534,
      usageCoveragePercent: 100,
      costEstimateComplete: true,
    });
  });

  it("does not present partial usage as a complete cost estimate", () => {
    expect(summarizeAiCostEstimate(3, 2, BigInt(50_000))).toEqual({
      costEstimateUsd: null,
      usageCoveragePercent: 67,
      costEstimateComplete: false,
    });
  });

  it("reports zero estimated provider usage before any reserved requests", () => {
    expect(summarizeAiCostEstimate(0, 0, BigInt(0))).toEqual({
      costEstimateUsd: 0,
      usageCoveragePercent: null,
      costEstimateComplete: true,
    });
  });
});

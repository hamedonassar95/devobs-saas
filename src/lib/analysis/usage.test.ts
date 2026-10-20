import { describe, expect, it } from "vitest";
import { getDailyAiRequestLimit, getUtcDayStart } from "./usage";

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

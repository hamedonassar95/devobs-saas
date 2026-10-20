import { describe, expect, it } from "vitest";
import { planIncludesFeature } from "./plans";

describe("subscription plan entitlements", () => {
  it("limits each plan to its included product features", () => {
    expect(planIncludesFeature("MONITORING", "monitoring")).toBe(true);
    expect(planIncludesFeature("MONITORING", "cicd")).toBe(false);
    expect(planIncludesFeature("MONITORING", "ai")).toBe(false);
    expect(planIncludesFeature("CICD", "cicd")).toBe(true);
    expect(planIncludesFeature("CICD", "monitoring")).toBe(false);
    expect(planIncludesFeature("CICD", "ai")).toBe(false);
    expect(planIncludesFeature("FULL", "monitoring")).toBe(true);
    expect(planIncludesFeature("FULL", "cicd")).toBe(true);
    expect(planIncludesFeature("FULL", "ai")).toBe(true);
  });
});

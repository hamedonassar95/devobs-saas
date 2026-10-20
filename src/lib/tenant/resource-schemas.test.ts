import { describe, expect, it } from "vitest";
import { tenantResourceSchemas } from "./resource-schemas";

describe("tenant resource input limits", () => {
  it("bounds analysis detail JSON before it reaches PostgreSQL", () => {
    const schema = tenantResourceSchemas["analysis-results"];
    const base = { summary: "A short analysis" };

    expect(schema.safeParse({ ...base, details: { note: "ok" } }).success).toBe(true);
    expect(schema.safeParse({ ...base, details: { payload: "x".repeat(16_385) } }).success).toBe(false);
  });
});

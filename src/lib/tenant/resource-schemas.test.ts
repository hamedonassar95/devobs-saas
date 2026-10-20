import { describe, expect, it } from "vitest";
import { tenantResourceSchemas } from "./resource-schemas";

describe("tenant resource input limits", () => {
  it("bounds analysis detail JSON before it reaches PostgreSQL", () => {
    const schema = tenantResourceSchemas["analysis-results"];
    const base = { summary: "A short analysis" };

    expect(schema.safeParse({ ...base, details: { note: "ok" } }).success).toBe(true);
    expect(schema.safeParse({ ...base, details: { payload: "x".repeat(16_385) } }).success).toBe(false);
  });

  it("only allows CI/CD providers whose API can be read without triggering billed work", () => {
    const schema = tenantResourceSchemas.integrations;
    const base = { name: "Core", repositoryUrl: "https://github.com/acme/core" };

    expect(schema.safeParse({ ...base, provider: "GITHUB" }).success).toBe(true);
    expect(schema.safeParse({ ...base, provider: "GITLAB" }).success).toBe(true);
    expect(schema.safeParse({ ...base, provider: "BITBUCKET" }).success).toBe(true);
    expect(schema.safeParse({ ...base, provider: "OTHER" }).success).toBe(false);
  });

  it("rejects monitoring services with metered hosted plans", () => {
    const schema = tenantResourceSchemas["monitoring-sources"];
    const base = { name: "Production" };

    expect(schema.safeParse({ ...base, provider: "PROMETHEUS" }).success).toBe(true);
    expect(schema.safeParse({ ...base, provider: "GRAFANA" }).success).toBe(true);
    expect(schema.safeParse({ ...base, provider: "DATADOG" }).success).toBe(false);
    expect(schema.safeParse({ ...base, provider: "CLOUDWATCH" }).success).toBe(false);
    expect(schema.safeParse({ ...base, provider: "OTHER" }).success).toBe(false);
  });
});

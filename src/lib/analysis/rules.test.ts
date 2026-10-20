import { describe, expect, it } from "vitest";
import { analyzeAlertWithLocalRules } from "./rules";

describe("local no-provider alert triage", () => {
  it("returns deterministic database guidance without calling an external model", () => {
    const alert = { title: "Database connection pool", description: "Postgres connections are saturated.", severity: "CRITICAL" as const, status: "OPEN" as const };
    const first = analyzeAlertWithLocalRules(alert);
    const second = analyzeAlertWithLocalRules(alert);

    expect(first).toEqual(second);
    expect(first.details.engine).toBe("local-rules-v1");
    expect(first.details.nextSteps).toContain("Check database health, connection saturation, and the latest slow-query or error logs.");
    expect(first.details.note).toContain("No AI model or external provider was called");
  });

  it("selects focused checks from the alert text", () => {
    expect(analyzeAlertWithLocalRules({ title: "Memory OOM", description: null, severity: "WARNING", status: "ACKNOWLEDGED" }).details.nextSteps)
      .toContain("Check memory usage, recent workload growth, and out-of-memory restarts before raising limits.");
  });
});

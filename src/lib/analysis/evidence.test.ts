import { describe, expect, it } from "vitest";
import { buildAlertEvidenceScope, isAlertEvidenceScope } from "./evidence";

describe("analysis evidence scope", () => {
  it("lists only present fields and missing linked signals without copying alert text", () => {
    const scope = buildAlertEvidenceScope({
      title: "private service name",
      description: "customer supplied notes",
      severity: "CRITICAL",
      status: "OPEN",
      sourceProvider: "GRAFANA",
    });

    expect(scope).toEqual({
      basis: "single-alert",
      availableFields: ["title", "description", "severity", "status", "monitoringProvider"],
      missingSignals: ["telemetry", "ciRuns", "deployments"],
    });
    expect(JSON.stringify(scope)).not.toContain("private service name");
    expect(JSON.stringify(scope)).not.toContain("customer supplied notes");
  });

  it("omits an empty description and unknown monitoring provider", () => {
    expect(buildAlertEvidenceScope({
      title: "Database alert",
      description: "  ",
      severity: "WARNING",
      status: "ACKNOWLEDGED",
    })).toEqual({
      basis: "single-alert",
      availableFields: ["title", "severity", "status"],
      missingSignals: ["telemetry", "ciRuns", "deployments"],
    });
  });

  it("rejects malformed or expanded evidence scopes before UI rendering", () => {
    expect(isAlertEvidenceScope({
      basis: "single-alert",
      availableFields: ["title", "databaseUrl"],
      missingSignals: ["telemetry"],
    })).toBe(false);
    expect(isAlertEvidenceScope({ basis: "single-alert", availableFields: [], missingSignals: [] })).toBe(false);
    expect(isAlertEvidenceScope({
      basis: "single-alert",
      availableFields: ["title", "title"],
      missingSignals: ["telemetry", "ciRuns", "deployments"],
    })).toBe(false);
    expect(isAlertEvidenceScope({
      basis: "single-alert",
      availableFields: ["title"],
      missingSignals: ["telemetry"],
    })).toBe(false);
    expect(isAlertEvidenceScope(null)).toBe(false);
  });
});

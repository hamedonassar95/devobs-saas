import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateScanResults, inspectTrivyReport } from "./trivy-report-gate.mjs";

function report(image, vulnerabilities = []) {
  return JSON.stringify({
    SchemaVersion: 2,
    ArtifactName: image,
    Results: [{ Target: image, Class: "os-pkgs", Vulnerabilities: vulnerabilities }],
  });
}
function vuln(severity) {
  return {
    VulnerabilityID: "CVE-TEST-1234",
    PkgName: "test-package",
    InstalledVersion: "1.0.0",
    FixedVersion: "1.0.1",
    Severity: severity,
  };
}
function evaluate(runner = report("devobs-saas:ci"), migrator = report("devobs-saas:migrator-ci"), status = "success") {
  return evaluateScanResults({
    runner: { outcome: status, json: runner },
    migrator: { outcome: "success", json: migrator },
  });
}

test("clean scan results pass for both images", () => {
  assert.equal(evaluate().passed, true);
});
test("LOW, MEDIUM and UNKNOWN findings do not block", () => {
  assert.equal(evaluate(report("devobs-saas:ci", [vuln("LOW"), vuln("MEDIUM"), vuln("UNKNOWN")])).passed, true);
});
test("HIGH vulnerabilities fail the gate", () => {
  const result = evaluate(report("devobs-saas:ci", [vuln("HIGH")]));
  assert.equal(result.passed, false);
  assert.equal(result.counts.runner, 1);
});
test("CRITICAL findings in migrator block even if runner passes", () => {
  const result = evaluate(undefined, report("devobs-saas:migrator-ci", [vuln("CRITICAL")]));
  assert.equal(result.passed, false);
  assert.equal(result.counts.migrator, 1);
});
test("both images are evaluated even when the runner has findings", () => {
  const result = evaluate(report("devobs-saas:ci", [vuln("HIGH")]), report("devobs-saas:migrator-ci", [vuln("CRITICAL")]));
  assert.equal(result.passed, false);
  assert.equal(result.counts.runner, 1);
  assert.equal(result.counts.migrator, 1);
});
test("missing report fails closed", () => {
  assert.equal(evaluate(undefined, "").passed, false);
});
test("invalid JSON fails closed", () => {
  assert.equal(evaluate("{broken").passed, false);
});
test("scanner failure fails even with a clean report", () => {
  assert.equal(evaluate(undefined, undefined, "failure").passed, false);
});
test("skipped scanner fails even with a clean report", () => {
  assert.equal(evaluate(undefined, undefined, "skipped").passed, false);
});
test("wrong image identity is rejected", () => {
  assert.equal(evaluate(report("another-image:ci")).passed, false);
});
test("absent Results or malformed vulnerabilities cannot masquerade as clean", () => {
  assert.throws(() => inspectTrivyReport({ SchemaVersion: 2, ArtifactName: "devobs-saas:ci" }, "devobs-saas:ci"));
  assert.equal(
    evaluate(JSON.stringify({ SchemaVersion: 2, ArtifactName: "devobs-saas:ci", Results: [{ Vulnerabilities: {} }] })).passed,
    false,
  );
});
test("unknown vulnerability severity fails closed", () => {
  assert.equal(evaluate(report("devobs-saas:ci", [vuln("BAD-SEVERITY")])).passed, false);
});

// Static regression checks prevent accidental loss of coverage in CI.
test("CI scans both Docker targets and gates Netlify deploy", async () => {
  const { readFileSync } = await import("node:fs");
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  for (const expected of [
    "image-security-scan:",
    "--target runner --tag devobs-saas:ci",
    "--target migrator --tag devobs-saas:migrator-ci",
    "image-ref: devobs-saas:ci",
    "image-ref: devobs-saas:migrator-ci",
    "needs: [node, verify, image-security-scan]",
    "TRIVY_RUNNER_OUTCOME:",
    "TRIVY_MIGRATOR_OUTCOME:",
    "scan_runner.outcome",
    "scan_migrator.outcome",
  ]) {
    assert.ok(workflow.includes(expected), `missing CI guard: ${expected}`);
  }
});

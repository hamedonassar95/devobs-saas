import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TARGETS = [
  { label: "runner", image: "devobs-saas:ci" },
  { label: "migrator", image: "devobs-saas:migrator-ci" },
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeValue(value) {
  return typeof value === "string"
    ? value.replace(/[\r\n\t\x00-\x1f\x7f]/g, " ").slice(0, 150)
    : "unknown";
}

/**
 * Strictly validate the scanner's JSON shape and identity before deciding whether
 * a built image has any blocking OS or application-library vulnerabilities.
 */
export function inspectTrivyReport(report, expectedImage) {
  if (!isRecord(report) || !Number.isInteger(report.SchemaVersion) || report.SchemaVersion < 1) {
    throw new Error("invalid Trivy JSON schema");
  }
  if (report.ArtifactName !== expectedImage || !Array.isArray(report.Results)) {
    throw new Error("unexpected image identity or missing Results array");
  }

  const blockers = [];
  for (const result of report.Results) {
    if (!isRecord(result)) throw new Error("invalid Trivy result");
    const vulnerabilities = result.Vulnerabilities ?? [];
    if (!Array.isArray(vulnerabilities)) throw new Error("invalid vulnerability list");

    for (const vulnerability of vulnerabilities) {
      if (!isRecord(vulnerability) || typeof vulnerability.Severity !== "string") {
        throw new Error("invalid vulnerability entry");
      }
      const severity = vulnerability.Severity.toUpperCase();
      if (!["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) {
        throw new Error("unrecognized vulnerability severity");
      }
      if (severity === "HIGH" || severity === "CRITICAL") {
        blockers.push({
          severity,
          id: safeValue(vulnerability.VulnerabilityID),
          package: safeValue(vulnerability.PkgName),
          installed: safeValue(vulnerability.InstalledVersion),
          fixed: safeValue(vulnerability.FixedVersion),
        });
      }
    }
  }
  return blockers;
}

/**
 * Outcomes reflect the actual Trivy action steps, not their continue-on-error
 * conclusions. A failed scan can never pass on a missing/partial JSON report.
 */
export function evaluateScanResults(scans) {
  const issues = [];
  const counts = {};

  for (const target of TARGETS) {
    const scan = scans[target.label];
    if (!scan || scan.outcome !== "success") {
      issues.push(`${target.label}: scanner did not complete successfully`);
    }

    if (typeof scan?.json !== "string" || scan.json.trim() === "") {
      issues.push(`${target.label}: missing JSON report`);
      continue;
    }

    try {
      const blockers = inspectTrivyReport(JSON.parse(scan.json), target.image);
      counts[target.label] = blockers.length;
      if (blockers.length) {
        issues.push(`${target.label}: ${blockers.length} HIGH/CRITICAL vulnerabilities`);
        for (const blocker of blockers.slice(0, 20)) {
          issues.push(
            `  ${blocker.severity} ${blocker.id} | ${blocker.package} ${blocker.installed} | fixed: ${blocker.fixed}`,
          );
        }
        if (blockers.length > 20) {
          issues.push(`  ... plus ${blockers.length - 20} more; inspect the uploaded report`);
        }
      }
    } catch (error) {
      issues.push(`${target.label}: invalid scan report (${error instanceof Error ? error.message : "unknown error"})`);
    }
  }
  return { passed: issues.length === 0, issues, counts };
}

function readReport(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function main() {
  const result = evaluateScanResults({
    runner: {
      outcome: process.env.TRIVY_RUNNER_OUTCOME,
      json: readReport(process.argv[2]),
    },
    migrator: {
      outcome: process.env.TRIVY_MIGRATOR_OUTCOME,
      json: readReport(process.argv[3]),
    },
  });
  for (const [target, count] of Object.entries(result.counts)) {
    console.log(`${target}: ${count} blocking vulnerabilities`);
  }
  if (!result.passed) {
    for (const issue of result.issues) console.error(issue);
    process.exitCode = 1;
  } else {
    console.log("Both Docker images passed the Trivy security gate.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) {
    console.error("Usage: node scripts/trivy-report-gate.mjs <runner-json> <migrator-json>");
    process.exitCode = 2;
  } else {
    main();
  }
}

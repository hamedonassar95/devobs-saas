# Docker image security scanning

This control scans the two Docker build targets used by Devobs SaaS before the Netlify production deployment job can become eligible to run. It provides a blocking vulnerability gate, not proof that a release is free of vulnerabilities.

## Coverage and CI execution

The `.github/workflows/ci.yml` pipeline executes independent jobs:

1. `node`: reusable Node.js tests, lint, type checks, and application build.
2. `verify`: PostgreSQL tenant-isolation integration tests and Terraform validation (no apply).
3. `image-security-scan`: builds `Dockerfile` targets `runner` and `migrator`, scans **both** local images with Trivy, validates both results, then uploads JSON reports.
4. `deploy-netlify`: requires success from **all three** prerequisite jobs, a `main` branch push/dispatch, the existing deployment enablement flag, and approval from the protected GitHub `production` environment.

Images are built in the security job only; they are not pushed to a registry, and the job performs no production deployment or database migration.

## Scanner and gate

- Trivy: **v0.76.2** (explicitly pinned), through `aquasecurity/trivy-action` **v0.36.0** at commit `ed142fd0673e97e23eac54620cfb913e5ce36c25`.
- Scan type: container image; scanners: vulnerabilities; package types: OS and application libraries.
- Capture severities: UNKNOWN, LOW, MEDIUM, HIGH, CRITICAL. **HIGH or CRITICAL blocks CI**, including findings without a published fix.
- The Trivy action uses `exit-code: "0"` so both reports can be collected even when vulnerabilities are present. **This is not an exception to the security gate**: `scripts/trivy-report-gate.mjs` explicitly fails if either scan step failed/skipped, if either JSON report is missing/malformed/mismatched, or if any HIGH/CRITICAL vulnerability exists.
- A scan cannot pass merely because the action step has `continue-on-error`. The gate checks the original step `outcome` instead of the softened job `conclusion`.
- The gate runs when earlier steps fail (unless the workflow was cancelled), preventing scan errors from appearing as a successful job.
- Lower severities are included in reports for remediation planning but do not by themselves block this policy.

JSON artifacts named `trivy-image-security-reports` are retained for 14 days and uploaded even if the security gate fails (if any reports were produced). Artifact download access follows repository/Actions permissions. The scanner does not accept runtime production secrets, and Docker builds use the existing `.dockerignore` protections. Review reports before forwarding them to external services.

## Remediation

1. Open the failed `image-security-scan` job and read the gate's summary.
2. Open its `trivy-image-security-reports` artifact; inspect `runner.json` and `migrator.json` separately.
3. Record each CVE, affected package, installed version, and `FixedVersion` when available. Prefer a patched base image or a reviewed dependency update; test the corresponding application or migration container.
4. Open a separate feature-branch PR for remediation. Do not weaken the severity threshold, disable scanning, or ignore unfixed vulnerabilities merely to pass CI.
5. Confirm the revised PR runs and passes both scans and the existing tenant-isolation, Node.js, and Terraform checks before requesting merge/production approval.

Local gate tests (no Docker daemon or Trivy installation necessary):

```sh
npm run test:security-gate
```

Optional read-only local scan of locally built images (requires Docker and Trivy v0.76.2):

```sh
docker build --target runner -t devobs-saas:ci .
docker build --target migrator -t devobs-saas:migrator-ci .
mkdir -p trivy-reports
trivy image --scanners vuln --pkg-types os,library --ignore-unfixed=false --format json --output trivy-reports/runner.json devobs-saas:ci
trivy image --scanners vuln --pkg-types os,library --ignore-unfixed=false --format json --output trivy-reports/migrator.json devobs-saas:migrator-ci
TRIVY_RUNNER_OUTCOME=success TRIVY_MIGRATOR_OUTCOME=success node scripts/trivy-report-gate.mjs trivy-reports/runner.json trivy-reports/migrator.json
```

## Limitations and remaining controls

- The paused `.github/workflows/deploy-gcp.yml` is retained as an inactive `workflow_call` reference. **Do not activate or invoke it** without adding an equivalent verified image-scan gate in that deployment path and obtaining owner approval.
- A Netlify auto-build, manual dashboard publish, or another external deployment path could bypass GitHub CI. Disable Netlify automatic Git builds and control provider-side publication access as described in `docs/deploy-netlify.md`.
- Only the specified build targets are scanned. This gate is not a substitute for dependency review, secret scanning, signed provenance, registry policies, runtime monitoring, or penetration testing.
- New CVE advisories and base-image updates can change scan outcomes on later runs. Failure to download current vulnerability databases is treated as a scanner failure, not as a clean result.
- The current Netlify/Neon pilot readiness is separately blocked by unverified runtime database health. Do not infer readiness or trigger deployment from a successful image scan alone.

**Human review remains mandatory before any production change.**

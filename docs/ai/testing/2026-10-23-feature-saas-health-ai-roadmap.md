---
phase: testing
title: Safe Health Diagnostics and Evidence-Backed AI Roadmap
feature: saas-health-ai-roadmap
description: Tests that protect generic health responses, safe diagnostics, and operator guidance
---

# Testing Strategy

## Test Coverage Goals

- Prove the success and 503 response contracts remain unchanged.
- Prove only allow-listed error codes and fixed categories reach logs.
- Prove URL, hostname, username, password, query string, and raw error-message canaries never reach logs or response bodies.
- Run the full unit suite, TypeScript, ESLint, Prisma validation, and AI DevKit structure lint before PR creation.
- Prove alert-only AI output cannot persist `high` confidence and its note identifies missing linked evidence.

## Unit Tests

`src/lib/analysis/cloudflare.test.ts` also covers:

- [x] The provider receives an alert-only evidence boundary in its system prompt.
- [x] A model response claiming high confidence is capped at medium and the result states that linked telemetry, CI, and deployment evidence were not supplied.

`src/lib/analysis/presentation.test.ts` covers:

- [x] Legacy saved Cloudflare analyses with high confidence are normalized in the response without changing the saved row.
- [x] Local, low-confidence, malformed, and unrelated model results remain unchanged.

`src/lib/analysis/evidence.test.ts` and `src/lib/analysis/service.test.ts` cover:

- [x] Evidence scope lists only field names present in the alert record, and never copies title or description values.
- [x] Empty descriptions and unknown providers are omitted.
- [x] Local and successful provider analyses carry the same explicit single-alert scope and missing linked-signal list.
- [x] Malformed, expanded, duplicate, or incomplete persisted scopes are rejected before dashboard rendering.

`src/app/api/health/route.test.ts` covers:

- [x] Successful PostgreSQL probe returns 200 and no-store response.
- [x] Failed probe returns generic HTTP 503 and no-store response.
- [x] Missing/malformed URL metadata is represented as booleans only.
- [x] Nested allow-listed Prisma/network error codes are extracted without raw messages.
- [x] Lowercase allow-listed codes are normalized before classification.
- [x] Authentication, permissions, connectivity, timeout, TLS, missing-database, and pool-capacity classes map to fixed labels.
- [x] Neon-like `-pooler` host is detected without logging host or URL.
- [x] Message-only TLS classification logs only the fixed category.

## Integration Tests

- Existing PostgreSQL integration tests remain part of the full repository suite. They are not required for the health-route unit change.
- A deployed Netlify preview check is needed to validate actual function runtime/environment behavior; do not substitute a Neon SQL Editor query for this check.

## Test Data

Use fake credentials and hostnames in unit tests. Never run tests against production databases or store real provider values in fixtures.

## Test Reporting & Coverage

TDD evidence recorded 2026-10-23:

- Before implementation, the updated health route suite failed: 9 failed, 1 passed.
- After implementation, `npm test -- src/app/api/health/route.test.ts` passed: 13 tests, 1 file.
- `npm test` passed: 97 tests across 18 files.
- `npm run typecheck` passed after regenerating the ignored local Prisma Client from the checked-in schema.
- `npm run lint` passed; `npx prisma validate` passed with temporary localhost placeholders for the required URL variables.
- `npx ai-devkit@latest lint` and `npx ai-devkit@latest lint --feature saas-health-ai-roadmap` passed with 7 and 16 checks respectively.
- Draft PR #28 CI passed Node.js checks and tenant database/Terraform/container checks; Netlify header/redirect checks passed and Deploy Preview became ready. The production deploy job was skipped as expected for a PR.
- The PR #28 preview `/api/health` request returned HTTP 503, confirming the database runtime issue remains. Its Function log must be inspected for the new safe fields; CI success alone does not validate the database connection.
- The Vitest coverage provider package is not installed, so no coverage percentage is reported.
- Production build is deferred to CI because only 58 MB of workspace disk remained and `.next` output could exhaust it. Preview and post-deploy checks are still required.
- Follow-up verification 2026-10-23: `npm test` passes 100 tests across 19 files, `npm run typecheck`, `npm run lint`, and `npx prisma validate` pass from a temporary workspace. AI DevKit install listed 28 skills, and base/feature lint passed 7/16 checks. The current workspace had 35 MB free, so dependencies and verification ran under `/tmp`; Prisma validation used placeholder localhost URLs and made no database connection.
- The alert-only confidence guard is covered by a provider contract test that supplies a `high` model response and expects a stored `medium` confidence plus the missing-evidence note.
- T11 red/green evidence: service tests first failed because `evidenceScope` was absent; after implementation, 9 targeted tests passed. A validation-hardening assertion then failed for an empty scope and passed after strict validation was added.
- Final T11 verification 2026-10-23: `npm test` passed 105 tests across 20 files; `npm run typecheck`, `npm run lint`, Prisma validation with placeholder localhost URLs, base and feature AI DevKit lint (7/16 checks), and `git diff --check` all passed. No database connection was made.

## Manual Testing

On Deploy Preview #28, request `/api/health`, then inspect only the fixed event fields in Netlify Function logs. Confirm no URL, hostname, credential, query, or raw message appears. Keep Production and Deploy Preview checks separate.

## Performance Testing

No new outbound calls or retries are added. The existing database probe remains the measured operation; collect deployment evidence if runtime timing changes materially.

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

## Unit Tests

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
- The Vitest coverage provider package is not installed, so no coverage percentage is reported.
- Production build is deferred to CI because only 58 MB of workspace disk remained and `.next` output could exhaust it. Preview and post-deploy checks are still required.

## Manual Testing

After a reviewed preview deploy, request `/api/health`, then inspect only the fixed event fields in Netlify Function logs. Confirm no URL, hostname, credential, query, or raw message appears. Keep Production and Deploy Preview checks separate.

## Performance Testing

No new outbound calls or retries are added. The existing database probe remains the measured operation; collect deployment evidence if runtime timing changes materially.

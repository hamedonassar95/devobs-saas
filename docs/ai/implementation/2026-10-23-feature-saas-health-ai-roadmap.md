---
phase: implementation
title: Safe Health Diagnostics and Evidence-Backed AI Roadmap
feature: saas-health-ai-roadmap
description: Implementation choices and constraints for the health diagnostic and research work
---

# Implementation Guide

## Development Setup

Use the repository's existing Node.js dependency tree. Required commands are `npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate`. Do not run provider migrations or require real provider credentials for these checks.

## Code Structure

- `src/app/api/health/route.ts`: API probe and safe failure metadata.
- `src/app/api/health/route.test.ts`: route tests, including canary values that verify secret and message non-disclosure.
- `docs/competitive-landscape-2026-10-23.md`: representative peer review and roadmap.
- `docs/deploy-netlify.md`: provider owner runbook.

## Implementation Notes

- `safeDatabaseUrlDetails` returns only whether the environment variable is present, whether it parses as a PostgreSQL URL with a host, and whether the host looks like a pooled host. It discards the parsed URL.
- `safeDatabaseErrorDetails` inspects at most three error/cause levels, extracts only known Prisma/network code formats, normalizes the token, and maps known codes or broad safe message patterns to a fixed category.
- Unknown error codes and unrecognized messages are omitted.
- The route preserves the generic no-store JSON response on both success and failure.
- No database schema, migrations, provider integrations, or deploy workflow were changed.

## Error Handling

The route must not `console.error(error)`, serialize an exception, or include `DATABASE_URL` in logs. Classification is diagnostic guidance, not proof of root cause. A successful SQL-editor check on a Neon branch is not proof that Netlify points at the same project and branch.

## Performance Considerations

The check is synchronous with the existing `SELECT 1` probe and examines at most three causal error objects. It adds no network requests, retries, model calls, or database queries.

## Security Notes

- Fixed log fields and allowlists prevent raw connection strings and error messages from reaching logs.
- The HTTP response remains generic and includes `Cache-Control: no-store`.
- Runtime environment variables stay outside source control; do not copy them into issue comments or chat.
- The app remains tenant-scoped; the feature adds no tenant data or cross-tenant operation.

## Current Implementation Record — 2026-10-23

- Changed the health route and its unit tests; added current runtime status and owner troubleshooting to `docs/deploy-netlify.md`.
- Added the dated competitive review and AI roadmap at `docs/competitive-landscape-2026-10-23.md`.
- Initialized AI DevKit for Codex and recorded feature-specific requirements, design, plan, implementation, testing, deployment, and monitoring artifacts.
- No Prisma schema, migration, GitHub workflow, Netlify setting, Neon setting, or production resource changed.
- Unit tests, typecheck, ESLint, Prisma schema validation, and DevKit lint passed. The production build and post-deploy preview checks remain CI/owner checkpoints; workspace disk was 58 MB at the last check.
- Known limitation: the current health log has not surfaced an underlying error code. The new categories improve future diagnosis but do not themselves repair the production database URL or prove which provider setting is wrong.

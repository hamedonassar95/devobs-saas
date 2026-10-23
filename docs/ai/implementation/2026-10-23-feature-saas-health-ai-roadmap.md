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
- `src/lib/analysis/evidence.ts`: typed evidence-scope contract and strict validation for JSON details.
- `src/app/dashboard/ai/ai-controls.tsx`: visible list of available alert fields and missing linked signals.
- `src/lib/analysis/evidence.test.ts` and `src/lib/analysis/service.test.ts`: evidence-scope and analysis-selection coverage.
- `docs/competitive-landscape-2026-10-23.md`: representative peer review and roadmap.
- `docs/deploy-netlify.md`: provider owner runbook.

## Implementation Notes

- `safeDatabaseUrlDetails` returns only whether the environment variable is present, whether it parses as a PostgreSQL URL with a host, and whether the host looks like a pooled host. It discards the parsed URL.
- `safeDatabaseErrorDetails` inspects at most three error/cause levels, extracts only known Prisma/network code formats, normalizes the token, and maps known codes or broad safe message patterns to a fixed category.
- Unknown error codes and unrecognized messages are omitted.
- Cloudflare output treats likely cause as a hypothesis when only a single alert is available; high confidence is capped at medium in application code, and the saved note lists absent telemetry/CI/deployment context.
- The organization analysis-list API and cached-analysis response normalize legacy Cloudflare rows with high confidence to medium in the response; database rows are not rewritten.
- The route preserves the generic no-store JSON response on both success and failure.
- No database schema, migrations, provider integrations, or deploy workflow were changed.
- For alert-only provider analysis, instructed the model to abstain when evidence is insufficient and added a server-side confidence cap at medium; documented that no telemetry, CI, or deployment evidence is linked yet.
- New local and provider analysis results carry only an allow-listed description of present alert fields and absent linked signals; no alert text is copied into this metadata. The dashboard validates stored JSON before rendering it and labels older results as pre-existing.
- Fixed AI DevKit setup by persisting the upstream registry and ignoring generated `.agents/` symlinks rather than tracking machine-specific links.

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
- Unit tests, typecheck, ESLint, Prisma schema validation, DevKit lint, and a local production build passed. The build ran from a temporary `/tmp` workspace because the main filesystem had 35 MB free; database validation used placeholder localhost URLs.
- Known limitation: the current health log has not surfaced an underlying error code. The new categories improve future diagnosis but do not themselves repair the production database URL or prove which provider setting is wrong.
- Known limitation: the new AI guard reduces overconfident presentation but does not itself add evidence correlation or prove model factual accuracy.
- Known limitation: evidence-scope reporting is descriptive; it does not link monitoring alerts to CI runs, deployments, or an incident timeline.
- A fresh PR build is required to validate the evidence-scope UI in the hosted preview. The previous preview predates this iteration.
- Draft PR #28's Node.js and tenant/database/Terraform/container jobs passed; Netlify preview checks passed and the preview is ready. Its `/api/health` still returns 503; production deployment was skipped.

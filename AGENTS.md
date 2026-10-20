# AGENTS.md

## Project
- Repository: `hamedonassar95/devobs-saas`.
- This is a new, separate SaaS application for Devobs. The existing `Devobs` repository remains the static site, automation hub, and index; do not add this application's code there.
- Product goal: a paid, multi-tenant SaaS for small startups without a DevOps team, covering CI/CD automation, monitoring, and AI-assisted analysis.
- Approved application stack: Next.js, TypeScript, Prisma, and PostgreSQL.

## Completed Phase 2 scope
Tenant-aware foundations are implemented on `main`:
1. Organizations (tenants), Users, and Memberships.
2. Authentication and server-managed sessions.
3. Tenant-scoped authorization on every read and write; fail closed when tenant context or membership is missing.
4. Tenant-linked CI/CD integrations, monitoring sources, alerts, and analysis results.
5. Automated tests proving that cross-tenant reads and writes are denied.

## Current Phase 3 scope
- Add Stripe monthly subscriptions for Monitoring only, CI/CD, and Full with AI.
- Add authenticated Checkout and Customer Portal routes, signed webhooks for subscription activation/status/cancellation, and a 14-day trial for first-time subscriptions.
- Enforce plan feature entitlements on tenant-scoped CI/CD, monitoring, and AI analysis resource routes.
- Keep billing records tenant-scoped and add tests for authorization, entitlements, and webhook updates.
- Do not implement the marketing landing page or cloud deployment in this phase.

## Engineering rules
- Work on a feature branch based on `main`; never commit directly to `main`.
- Keep changes scoped to the approved phase and make them reviewable.
- Run the repository's existing tests after implementation; add targeted tests for tenant isolation.
- Open a pull request to `main` after implementation and tests. Do not merge without explicit user confirmation.
- Never commit credentials, tokens, passwords, or populated environment files. Use environment variables and provide safe examples only.
- Do not invent product requirements or claim security guarantees without tests and implementation evidence.
- Mark material assumptions clearly and ask before choosing an authentication provider or other consequential product behavior not specified by the user.

## Current repository state
- Phase 2 has been merged into `main` in PR #1.
- Phase 3 is being developed on `phase3-stripe-billing`; open a PR to `main` after tests pass and do not merge without explicit user confirmation.

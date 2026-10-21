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

## Completed Phase 3 scope
- Add Stripe monthly subscriptions for Monitoring only, CI/CD, and Full with AI.
- Add authenticated Checkout and Customer Portal routes, signed webhooks for subscription activation/status/cancellation, and a 14-day trial for first-time subscriptions.
- Enforce plan feature entitlements on tenant-scoped CI/CD, monitoring, and AI analysis resource routes.
- Keep billing records tenant-scoped and add tests for authorization, entitlements, and webhook updates.

## Completed Phase 4 scope
- Build the public landing page with the headline, problems solved, three core features, monthly pricing, a 14-day trial CTA, and a contact form.
- Keep displayed prices aligned with the configured monthly Stripe Prices; do not invent dollar amounts.
- Keep contact delivery server-side and use environment variables for email provider credentials and recipient/sender settings.

## Current deployment status and approved alternative
- The original Google Cloud Run route is paused by the owner because the target project has no billing account. Do not run `gcloud`, enable paid services, or activate the old GCP deploy workflow unless the owner explicitly changes direction.
- The current no-billing deployment candidate is Netlify Free plus Neon Free, for a demo or limited early pilot only. These tiers have strict quotas and do not provide production availability guarantees.
- GitHub Actions deploys only from `main`, only after CI passes, and only when the repository variable `NETLIFY_DEPLOY_ENABLED` is `true`; the `production` GitHub environment must require approval and restrict deployments to `main`.
- Provider projects, database, secrets, domain, and live deployment remain owner-controlled and are not provisioned from this workspace. Never ask the owner to paste secrets into chat.
- Keep the prior Google Cloud Terraform and Cloud Run instructions as inactive reference. No cloud resources were created or changed from this workspace.

## Engineering rules
- Work on a feature branch based on `main`; never commit directly to `main`.
- Keep changes scoped to the approved phase and make them reviewable.
- Run the repository's existing tests after implementation; add targeted tests for tenant isolation.
- Open a pull request to `main` after implementation and tests. Do not merge without explicit user confirmation.
- Never commit credentials, tokens, passwords, or populated environment files. Use environment variables and provide safe examples only.
- Do not invent product requirements or claim security guarantees without tests and implementation evidence.
- Mark material assumptions clearly and ask before choosing an authentication provider or other consequential product behavior not specified by the user.

## Current repository state
- Phase 2 was merged into `main` in PR #1.
- Phase 3 was merged into `main` in PR #2.
- Phase 4 was merged into `main` in PR #3.
- Phase 5 deployment configuration was merged into `main` in PR #4.
- Phase 5 deployment configuration and follow-up hardening were merged into `main` in PRs #4 and #5.
- Project-specific deployment preparation must be done on a feature branch and opened as a PR to `main`; do not merge without explicit user confirmation.

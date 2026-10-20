# AGENTS.md

## Project
- Repository: `hamedonassar95/devobs-saas`.
- This is a new, separate SaaS application for Devobs. The existing `Devobs` repository remains the static site, automation hub, and index; do not add this application's code there.
- Product goal: a paid, multi-tenant SaaS for small startups without a DevOps team, covering CI/CD automation, monitoring, and AI-assisted analysis.
- Approved application stack: Next.js, TypeScript, Prisma, and PostgreSQL.

## Phase 2 scope
Build tenant-aware foundations:
1. Organizations (tenants), Users, and Memberships.
2. Authentication and server-managed sessions.
3. Tenant-scoped authorization on every read and write; fail closed when tenant context or membership is missing.
4. Tenant-linked CI/CD integrations, monitoring sources, alerts, and analysis results.
5. Automated tests proving that cross-tenant reads and writes are denied.

Do not implement billing, pricing, the marketing landing page, or cloud deployment in this phase.

## Engineering rules
- Work on a feature branch based on `main`; never commit directly to `main`.
- Keep changes scoped to the approved phase and make them reviewable.
- Run the repository's existing tests after implementation; add targeted tests for tenant isolation.
- Open a pull request to `main` after implementation and tests. Do not merge without explicit user confirmation.
- Never commit credentials, tokens, passwords, or populated environment files. Use environment variables and provide safe examples only.
- Do not invent product requirements or claim security guarantees without tests and implementation evidence.
- Mark material assumptions clearly and ask before choosing an authentication provider or other consequential product behavior not specified by the user.

## Current repository state
- The repository was initialized with an empty `README.md`.
- The approved plan is to add the application and data models only after the user is told that this file is in place and confirms continuation.

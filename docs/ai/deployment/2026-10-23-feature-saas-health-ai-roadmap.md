---
phase: deployment
title: Safe Health Diagnostics and Evidence-Backed AI Roadmap
feature: saas-health-ai-roadmap
description: Deployment gates and owner-controlled Netlify/Neon operations
---

# Deployment Strategy

## Infrastructure

The current limited-pilot candidate is Netlify Free plus Neon Free. The provider accounts, secrets, and live deployment are owner-controlled. Free plans do not provide an availability commitment.

## Deployment Pipeline

Changes go through a feature branch and pull request to `main`. Existing CI and protected production-environment approval remain the deployment gates. This branch makes no change to workflow gates, provider settings, or migrations.

## Environment Configuration

- Netlify **Production** `DATABASE_URL` must use the pooled runtime URL for the production Neon project.
- Netlify **Deploy Previews** `DATABASE_URL` must use the separate pooled runtime URL for the synthetic preflight project.
- `DIRECT_URL` is for Prisma migration tooling, not the Netlify runtime health probe.
- Never include populated variables in a commit, issue, or chat.

## Deployment Steps

1. Review the branch diff and CI results; create a draft PR for owner review.
2. Inspect the Deploy Preview health endpoint after its build completes.
3. If a Netlify variable changes, trigger a fresh deploy for that context; saved environment edits do not retroactively change an existing deployment.
4. Production remains behind the repository's protected environment and owner approval.
5. Use `docs/deploy-netlify.md` for detailed recovery and provider steps.

## Database Migrations

No schema migration is included. Do not run a production migration as part of this change.

## Rollback Plan

If the preview fails, do not publish it to production. Revert the feature branch/PR and retain the existing protected deploy path. The public health response remains generic throughout.

---
phase: monitoring
title: Safe Health Diagnostics and Evidence-Backed AI Roadmap
feature: saas-health-ai-roadmap
description: Health, privacy, and AI quality signals for this product phase
---

# Monitoring & Observability

## Key Metrics

### Reliability

- Track `/api/health` HTTP 200 and 503 rates separately for Production and Deploy Preview.
- Compare function duration and database-probe failure rate over time; do not infer success from duration-only log lines.
- Current observed status on 2026-10-23: Production and PR #27/#28 Deploy Previews all returned 503. PR #28's health diagnostics are deployed in that preview, not in Production.

### AI Quality

- Continue the synthetic offline analysis corpus and record local fallback versus provider success separately.
- Future incident analysis should measure evidence-link coverage, abstention quality, incorrect grouping, tenant-boundary failures, and human correction rate.
- Do not use customer alert text in evaluation fixtures.

## Logging Strategy

The health failure event is `health_check.database_probe_failed`. Safe fields are booleans about URL presence/shape/pooling and optional allow-listed error name/code/category. Raw database URLs and Prisma messages are prohibited. Netlify currently retains function logs for 24 hours; consult the project console promptly after a new failure.

## Alerts & Notifications

Recommended next operator action for repeated 503: verify runtime variable contexts, redeploy, request the endpoint again, and inspect the newest function event. This phase does not configure a new external alert or notification service.

## Incident Response

1. Confirm whether the failing request is Production or a specific Deploy Preview.
2. Check that context's `DATABASE_URL` presence, project/branch, pooled hostname marker, and app role without copying the value.
3. Trigger a fresh deploy after a variable edit.
4. Review only safe log fields. If the error remains unclassified, use Netlify/Neon support channels without sharing credentials publicly.
5. Record the verified cause and a synthetic regression test before changing behavior.

## Health Checks

The route runs `SELECT 1` and returns a no-store 200/503. It does not test sign-in, billing, alert ingestion, or all customer workflows. A successful result is a dependency smoke check, not a comprehensive readiness certification.

---
phase: planning
title: Safe Health Diagnostics and Evidence-Backed AI Roadmap
feature: saas-health-ai-roadmap
description: Ordered, reviewable work for health diagnostics and future AI incident workflows
---

# Project Planning & Task Breakdown

## Milestones

- [x] M1: Verify current app and provider health; establish test-first diagnostic change.
- [x] M2: Research representative peer systems from official documents and record a staged roadmap.
- [x] M3: Implement safe health logging and operator troubleshooting guidance.
- [x] M4: Run local unit/type/lint/schema/DevKit gates and prepare a reviewable change; CI handles the build because local disk is nearly full.
- [ ] M5: Owner confirms Netlify/Neon contexts; fresh deployed health checks return HTTP 200.

## Task Breakdown

| ID | Status | Outcome | Depends on | Validation evidence / scenario |
| --- | --- | --- | --- | --- |
| T1 | done | Record current SaaS runtime state and compare representative products using primary docs. | — | Live production and preview health checks both returned 503; report links official sources. |
| T2 | done | Specify safe health diagnostics and non-disclosure behavior in failing tests. | T1 | Baseline route suite failed on missing URL-shape/category fields before implementation. |
| T3 | done | Add URL-shape booleans, pooled-host hint, allow-listed error codes, and fixed categories. | T2 | 13 targeted health-route tests pass; canaries assert URL and raw error text are absent. |
| T4 | done | Write Netlify/Neon runbook and complete the seven AI DevKit phase artifacts. | T1–T3 | `npx ai-devkit@latest lint` passes; troubleshooting keeps production and preview separate. |
| T5 | done | Run local quality gates and review the diff for regressions/secrets. | T3–T4 | 97 tests pass; typecheck, ESLint, Prisma validation, base/feature lint, and `git diff --check` pass. Production build is reserved for CI due to low disk. |
| T6 | done | Open a draft PR to `main` and inspect CI/preview. | T5; GitHub write access | Draft PR #28 is open; Node, tenant/database, Terraform/container, header, redirect, and Netlify preview checks passed. The preview is ready but `/api/health` remains 503. Production deploy was skipped. |
| T7 | blocked | Confirm owner-controlled Netlify variables and resolve live 503 in each context. | T6; Netlify/Neon owner access | Fresh Production and Preview checks must each return HTTP 200; no secret values shared. |

### Sequencing notes

- T1–T4 are implementation/documentation work completed in this branch.
- T5 must pass before PR creation; if the low-disk environment blocks a gate, record the exact command and limitation rather than skipping silently.
- T6 is complete as a review checkpoint. Do not merge or publish automatically.
- T7 cannot be completed from the repository because provider settings and secrets are owner-controlled.

## Dependencies

- Existing repository dependency tree is reused because the workspace has only about 58 MB free; do not run `npm ci` or a production build that would require a large cache/output.
- PR creation depends on authenticated GitHub write access to the SaaS repository.
- Root-cause confirmation depends on owner-controlled Netlify and Neon settings/logs; no credentials are requested or accessed.

## Risks & Mitigation

- A boolean indicating PostgreSQL URL shape can be mistaken for connectivity. Name it precisely and document the limitation.
- Message-based classification may not recognize a new provider error. Keep the public response generic and omit unknown categories rather than logging raw text.
- A successful Neon SQL query can be run against a different project/branch from the Netlify function. Verify environment context separately.
- Free hosting tiers have strict limits and no availability commitment; retain a limited-pilot status.
- AI-generated repair can be wrong. Keep repairs as draft PRs, with tests and human review before merge/deploy.

## Resources Needed

- Existing test/type/lint tools in the repository's installed dependency tree.
- Official vendor documentation linked in `docs/competitive-landscape-2026-10-23.md`.
- Owner access to Netlify and Neon for the final context check; no secret values need to be shared.

## Progress summary

Health diagnostics, test-first evidence, provider research, operator documentation, and the draft PR are complete. Local gates and required CI checks passed; the new preview is ready. Production and preview health still return 503, so owner-controlled provider-context confirmation is the blocker. Incident grouping, OpenTelemetry ingestion, and evidence-backed multi-signal analysis remain separately planned future work and were not silently added to this patch.

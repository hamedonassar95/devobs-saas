---
phase: requirements
title: Safe Health Diagnostics and Evidence-Backed AI Roadmap
feature: saas-health-ai-roadmap
description: Improve safe diagnosis of database health failures and map staged AI incident-analysis work against current DevOps products
---

# Requirements & Problem Understanding

## Problem Statement

Devobs SaaS can return HTTP 503 when Prisma cannot reach PostgreSQL. Existing logs may show only `PrismaClientInitializationError` even when the URL is configured, so an operator cannot distinguish common classes such as authentication, connectivity, TLS, or pool capacity. The public response must remain generic and must not expose a database URL, hostname, credentials, or raw exception.

The product also analyzes an alert as an individual record. Representative observability and incident tools increasingly correlate alerts with telemetry and changes, preserve evidence for their conclusions, and keep remediation reviewable. Devobs needs a staged roadmap based on the current code and official vendor documentation rather than a broad, unverified rewrite.

## Goals & Objectives

- Add bounded, non-secret health log fields: recognized PostgreSQL URL shape, likely pooled-host marker, allow-listed error code, and fixed error category.
- Preserve the public health endpoint's current status and response contract.
- Update the operator runbook with safe steps for Netlify Production and Deploy Preview contexts.
- Compare representative global products using official documentation and record a prioritized, evidence-based AI roadmap.
- Make the AI DevKit artifacts usable for this work and future phases.

Non-goals for this change: repair Netlify/Neon account settings; modify or print provider secrets; add a new telemetry vendor; introduce an incident database migration; automatically merge, deploy, migrate, or mutate production; claim the hosted service is healthy.

## User Stories & Use Cases

- As an operator, I can identify a likely database failure class from function logs without seeing credentials or raw error text.
- As an operator, I can check the correct database URL context and trigger a fresh deploy without copying secrets into chat.
- As a small-team DevOps user, I can understand which AI incident features are already present and which are planned.
- As a reviewer, I can verify each market comparison against linked primary documentation.

## Success Criteria

- `/api/health` returns the same generic `{"status":"unavailable"}` with HTTP 503 on database failure and no-store caching.
- Logs contain only fixed categories, explicitly allow-listed codes, and booleans about the configured URL; tests prove URLs, hosts, usernames, passwords, and raw exception messages are absent.
- Tests cover recognized Prisma/network codes, nested causes, code normalization, URL shape, pooled-host detection, and message-only classification.
- Production and Deploy Previews #27 and #28 are independently identified as returning 503 until provider configuration is confirmed.
- A dated competitive report links official sources, labels the market sample representative rather than exhaustive, and separates current code from proposed work.

## Constraints & Assumptions

- The approved stack is Next.js, TypeScript, Prisma, and PostgreSQL; this change adds no database schema changes.
- Netlify and Neon projects, secrets, and deployment settings remain owner-controlled.
- A Neon SQL Editor `SELECT 1` proves only that selected project/branch handled that query; it does not prove the Netlify runtime uses the same connection string or deploy context.
- Netlify Free + Neon Free remains a demo or limited pilot, not an availability commitment.
- The competitive review is based on public official documents checked on 2026-10-23; features and availability may change.

## Questions & Open Items

- Owner must verify that each Netlify context points to its matching Neon project and pooled runtime URL, then redeploy.
- A fresh deployed diagnostic log is required to know the actual Prisma error category. The existing production log has only `PrismaClientInitializationError` and no underlying code.
- Grouping alerts into incidents requires a separately reviewed data model and migration plan; it is not implemented by this phase.

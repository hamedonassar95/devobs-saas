# Velox TriFit integration (offline-first)

Status: design scaffold only. No live integration, mock execution, deployment, billing, or API calls.

## Scope

Isolated optional module for Devobs SaaS (Next.js / TypeScript / Prisma / PostgreSQL). Do not modify existing tenants, subscriptions, CI deployment, or production routes.

Reference implementation: https://github.com/Velox-XR/trifit-partner-api-example

## Local validation plan

1. Review upstream `docs/GETTING_STARTED.md`, `WALKTHROUGH.md`, and JavaScript SDK/TypeScript declarations.
2. Run the upstream offline mock from its root with `node demo.mjs` and `node demo.mjs --failure`.
3. Add isolated automated tests for successful job lifecycle, failed upload, uncertain submission, and tenant isolation; record results before claiming verification.
4. Propose implementation changes in a draft PR only after review.

## Future security requirements

- Partner configuration must be Velox-issued and environment-specific. Consumer credentials and checked-in demo keys are not valid Partner API credentials.
- Secrets remain server-side; check `/me` partner identity/environment before uploads.
- Derive an opaque shopper subject from verified server session and organization membership; never trust a client-provided tenant or shopper identifier.
- Reserve and persist each asset ID before uploading; use only signed storage upload headers and persist completed asset IDs.
- Persist UUID idempotency key and exact input IDs before generation; store job receipt and poll. Do not retry unknown outcomes with a new key.
- Authorize result access per tenant and shopper. Do not log signed/private result URLs.
- No paid generation, production traffic, deployment, or enabling provider access without separate approval.

## Repository boundaries

This branch must not change `main`, existing CI deployment workflows, Netlify, Stripe, or production secrets. The existing SaaS health check and deployment status remain independent of this integration.

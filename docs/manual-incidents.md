# Manual incident records

## Scope

This feature adds tenant-scoped incident records that an authorized organization member creates by explicitly selecting existing alerts. Each link requires an operator-provided reason. It does not create groups automatically, infer causality, associate CI runs or deployments, or ask an AI model to decide which alerts belong together.

The first version supports `OPEN` and `RESOLVED` status. Resolution records the user and timestamp; reopening clears those fields. Alert status is independent and is never changed by incident operations.

## API

- `GET /api/organizations/{organizationId}/incidents` lists up to 25 recent records. Use the returned `nextCursor` for older records.
- `POST /api/organizations/{organizationId}/incidents` accepts a title, an optional description, and 1–25 alert links. Each link has an `alertId` and a reason of 8–500 characters.
- `GET /api/organizations/{organizationId}/incidents/{incidentId}` returns one record and its linked alert source, provider fingerprint when present, severity, status, and open time.
- `PATCH /api/organizations/{organizationId}/incidents/{incidentId}` accepts only `{ "status": "OPEN" | "RESOLVED" }`.

All endpoints require an active organization membership and the Monitoring plan entitlement. Reads require the `read` role permission; writes require `write`. Requests run inside the existing transaction-local tenant context. The API bounds request body size and list size, returns `Cache-Control: no-store`, and does not accept a client-supplied organization ID in write data.

The incidents dashboard can page through older incident records and alerts. It loads the next page only after an operator requests it; cursors are resolved inside the active tenant context before paging.

## Tenant and evidence boundaries

Both tables use forced PostgreSQL row-level security. Composite foreign keys bind each linked alert to the same `organizationId` as its incident. This prevents an incident link from crossing tenant boundaries even if a caller bypasses the application service. Foreign keys retain actor identity for creation and linking. Deleting an alert removes its incident link; deleting an organization cascades its records.

The link reason is operator-entered context, not independently verified evidence. Timestamps and provider fingerprints are copied from the linked alert at read time; no root cause or deployment relationship is implied. A record means only that an authorized member chose to review these alerts together.

## Operational notes

The migration is additive and has not been applied to a hosted database by this change. Deploy it through the repository's existing guarded release process after review. This version has no incident retention policy, cross-provider deduplication, CI/deployment correlation, OpenTelemetry ingestion, AI incident analysis, or incident notifications. Those require separate product, cost, privacy, and schema decisions.

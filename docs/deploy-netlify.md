# Netlify Free + Neon Free deployment

This is the no-billing-account path for a demo or limited early pilot. It is not a production availability commitment: Netlify's Free tier has no SLA and can pause or remove a project, and Neon recommends paid plans when production availability guarantees are required. Do not store irreplaceable customer data here or promise continuous service on these tiers.

## Current status

- The repository has a Netlify build configuration and a GitHub Actions deploy job that waits for CI and the protected `production` environment.
- Direct checks on October 23, 2026 returned HTTP 503 with `{"status":"unavailable"}` from production `/api/health` and Deploy Previews #27 and #28. The homepage and customer workflows were not re-certified in this check.
- Owner-provided function events show `databaseUrlConfigured: true` and `errorName: PrismaClientInitializationError`, but no underlying `errorCode`. This establishes that a URL value exists and Prisma initialization fails; it does not distinguish authentication, URL/project mismatch, network, TLS, or database availability. PR #27 added safe nested-code extraction, but the current events still have no code.
- PR #27 was merged to `main` at `e56617175809dab31d48029de38aa6d89daa7637`. A previous GitHub run passed CI but skipped the production deploy. The current `NETLIFY_DEPLOY_ENABLED` value and live project settings are not readable from this workspace; do not assume production updated just because a PR merged.
- The owner ran `SELECT 1` in Neon SQL Editor and saw one row. That proves the selected Neon project/branch accepted the editor query; it does not prove Netlify's Production and Deploy Preview runtime variables point to the same project/branch or use a pooled runtime URL.
- Google Cloud deployment is paused because the target project has no billing account. The existing Terraform and Cloud Run workflow are retained as inactive reference; CI no longer calls that deployment workflow.
- The first Neon migration initializes an empty database. It does not copy or migrate data from another environment.

The repository does not contain provider credentials. Do not mark the hosted service ready until an approved deployment completes and `/api/health` returns HTTP 200. Production and Deploy Preview remain unverified and currently return 503.

## Published free-tier limits checked on October 21, 2026

- Netlify's current Free plan is $0 with a 300-credit monthly hard limit and no auto-recharge. Projects pause when the account reaches its credit limit. Each production deploy currently uses 15 credits; function compute and bandwidth also use credits, so repeated deployments and traffic can exhaust the allowance sooner.
- Neon Free is $0/month without a credit card and currently includes 100 compute-hours and 1 GB of Postgres storage per project. Compute suspends when idle. This is a small database allowance; monitor usage and do not upgrade automatically.
- Netlify states that Free can host commercial projects, but its free tier has no service-level commitment and its terms reserve the right to suspend or remove free projects. Use this as a demo/early-pilot setup only.
- Stripe transaction processing and any paid Stripe account features are separate from hosting. Keep Stripe in test mode until prices, webhooks, support, backups, and an appropriate production hosting plan are deliberately set up.

Provider references: [Netlify pricing and credit use](https://www.netlify.com/pricing/), [Netlify free-plan limits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [Netlify Free commercial-project announcement](https://www.netlify.com/blog/introducing-netlify-free-plan/), [Netlify Free-tier terms](https://www.netlify.com/legal/self-serve-subscription-agreement/), [Netlify private-by-default projects](https://www.netlify.com/changelog/2026-07-28-start-with-private-project-urls/), [Neon pricing](https://neon.com/pricing), [Neon service-level agreement](https://neon.com/sla), and [Neon Free plan limits](https://neon.com/blog/neon-free-plan-1-gb-per-project).

## 1. Create the provider projects

1. Create a Netlify account and choose the **Free** plan. Do not enable a paid plan or credit auto-recharge.
2. Create a Netlify project from the `hamedonassar95/devobs-saas` GitHub repository. Use `main` as the production branch. Netlify reads `netlify.toml` and `.nvmrc` from the repository. New Free-plan projects can start private; before the first online deployment, set the project's visibility to public so visitors and the GitHub smoke test can reach the app.
3. Create two separate Neon projects, `devobs-saas-prod` and `devobs-saas-preflight`, and keep both on the **Free** plan. Do not attach a payment method or upgrade either plan. Keep the preflight database synthetic and isolated; do not clone production customer data into it. Create an application database role with `NOSUPERUSER NOBYPASSRLS` and a strong password in each project. The app role must own the app schema (or have the privileges needed by Prisma migrations); do not use a database superuser for the application.
4. In each Neon project, open **Connect** and copy two connection strings for that project's application role:
   - A **pooled** connection for `DATABASE_URL` (hostname contains `-pooler`).
   - A **direct/unpooled** connection for `DIRECT_URL`, used by Prisma migrations.

Keep the connection strings private. Do not paste them into chat, issues, or source files.

## 2. Configure Netlify runtime variables

In the Netlify project's environment-variable settings, set the production values under the **Production** deploy context. Set a separate `DATABASE_URL` for the **Deploy Previews** context that points to the isolated `devobs-saas-preflight` Neon project. Do not put production credentials in Deploy Previews. On the Free plan, variables apply to all scopes by default; keep secrets out of `netlify.toml` and do not use a `NEXT_PUBLIC_` prefix.

Required to use the application:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `devobs-saas-prod` pooled URL for the restricted application role |
| `APP_URL` | The HTTPS Netlify project URL, such as `https://<project>.netlify.app` |

For **Deploy Previews**, set `DATABASE_URL` to the pooled URL from `devobs-saas-preflight`. Do not configure Stripe credentials, production database URLs, or real customer data in the preview context.

For billing and contact features, add these server-side values when those integrations are ready:

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe API key; keep in test mode for the pilot |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `<APP_URL>/api/billing/webhook` |
| `STRIPE_PRICE_MONITORING` | Monthly Stripe Price ID for Monitoring |
| `STRIPE_PRICE_CICD` | Monthly Stripe Price ID for CI/CD |
| `STRIPE_PRICE_FULL` | Monthly Stripe Price ID for Full with AI |
| `RESEND_API_KEY` | Resend API key for the contact form |
| `CONTACT_EMAIL` | Inbox receiving contact requests |
| `CONTACT_FROM_EMAIL` | Sender verified with Resend |

Keep the optional Cloudflare Workers AI integration disabled unless its own free-plan limits and account configuration are verified. No model is called by the Netlify deploy workflow. To configure and operate it after deployment, follow [the AI integration runbook](./ai-integration-runbook.md); signed-in customers use `/dashboard/ai` for provider status, organization opt-in, alert analysis, and usage estimates. Monitoring-source creation remains API-managed.

## 3. Configure the protected GitHub deployment

The GitHub Actions deploy job is skipped until explicitly enabled. Set the following **repository variable** only after Netlify and Neon have been configured:

| Repository variable | Value |
| --- | --- |
| `NETLIFY_DEPLOY_ENABLED` | `true` |

In **Settings → Environments → production**, retain required reviewers and allow only `main`. Add:

**Environment variables**

| Name | Value |
| --- | --- |
| `NETLIFY_SITE_ID` | Netlify Project ID from Project configuration → General → Project details |
| `APP_URL` | Same HTTPS Netlify URL configured in Netlify |

**Environment secrets**

| Name | Value |
| --- | --- |
| `NETLIFY_AUTH_TOKEN` | Netlify personal access token |
| `NEON_DATABASE_URL` | Same pooled connection as Netlify's `DATABASE_URL` |
| `NEON_DIRECT_URL` | Same direct connection as Prisma's `DIRECT_URL` |
| `NEON_PREVIEW_DATABASE_URL` | Pooled connection for `devobs-saas-preflight` |
| `NEON_PREVIEW_DIRECT_URL` | Direct connection for `devobs-saas-preflight` |

After importing the GitHub repository in Netlify, pause Netlify's automatic Git builds so they cannot publish around the GitHub `production` approval gate. GitHub Actions still performs manual CLI deploys when CI passes and a reviewer approves the `production` environment. Netlify documents that manual deploys are the way to update a project while automatic builds are stopped.

The deploy job first checks that its commit is still the head of `main`, builds the production-context bundle once, and migrates the isolated preflight database. Both the preflight and production migration steps retry Prisma connection errors `P1001` and `P1002` up to six attempts with a bounded delay to accommodate Neon compute wake-up; other migration failures stop immediately. When it publishes the draft candidate, it explicitly binds the preflight `DATABASE_URL` to that deploy's server-side functions as a secret; the preflight health check therefore does not depend on the draft URL's deploy-context settings. Only then does it recheck that the commit is current, migrate production, recheck freshness, and publish the same bundle with the production `DATABASE_URL` bound as a secret. If the production health check fails, it asks Netlify to restore the previously published deploy and verifies the restored health endpoint. If the CLI reports a publish failure, the workflow still inspects the live health endpoint before failing, since the request may have succeeded before the CLI error. It runs only for a push or manual dispatch on `main`, and only when `NETLIFY_DEPLOY_ENABLED=true`. Database migrations are not automatically rolled back; production migrations must be backward-compatible with the prior app version.

The health endpoint records only the error class and a recognized database/network code in server logs. It never logs the raw database error message or connection URL, and it continues to return the generic `{"status":"unavailable"}` response to callers. Deploy Preview #28 includes additional URL-shape booleans and fixed error categories; production receives them only after review, merge, and its approved deployment.

## 3a. Troubleshoot `/api/health` returning 503

Keep Production and Deploy Preview separate. Do not paste a connection string, password, token, or raw Prisma message into chat or an issue.

1. In Netlify project environment variables, inspect the **context** and configured variable names. `DATABASE_URL` must exist in Production and Deploy Previews, with each context pointing to its matching Neon project. Production uses `devobs-saas-prod`; previews use the isolated `devobs-saas-preflight` project.
2. In each matching Neon project, verify the runtime value is the pooled connection for the application role. The hostname should include `-pooler`. `DIRECT_URL` is for migration tooling and does not replace the runtime `DATABASE_URL`.
3. Confirm the selected Neon project/branch and application role locally in the provider consoles; compare them without copying the value. A successful SQL Editor query on one branch does not verify another environment's connection.
4. Save a corrected variable and trigger a **new deploy for that context**. Existing function deployments do not pick up later variable edits.
5. Request `/api/health` on that exact deploy. If it still returns 503, inspect the newest `health_check.database_probe_failed` event. Current deployed code may show only `databaseUrlConfigured`, `errorName`, and a recognized `errorCode`. After the safe-diagnostics branch is deployed, it also reports `databaseUrlHasPostgresSchemeAndHost`, `databaseUrlLooksPooled`, and a fixed `errorCategory` when recognizable.
6. Use `errorCategory` as a clue, not proof: `authentication` or `permissions` point to role credentials or grants; `connectivity` or `timeout` point to endpoint reachability or availability; `tls` points to TLS negotiation; `database_missing` points to the selected database name; `connection_capacity` points to pool pressure. For an unclassified error, contact provider support with the request timestamp and non-secret event fields.
7. Keep TLS verification enabled. Do not disable SSL as a diagnostic shortcut, publish a preview to production, or run an unreviewed production migration.

Netlify requires a new deploy after environment-variable changes; see [Netlify environment-variable scopes and deploy contexts](https://docs.netlify.com/build/configure-builds/environment-variables/). Prisma's official meanings for codes such as `P1000`, `P1001`, `P1002`, `P1010`, `P1011`, and `P2024` are in the [Prisma error reference](https://www.prisma.io/docs/orm/reference/error-reference). Neon describes pooled connections in its [connection pooling guide](https://neon.com/docs/connect/connection-pooling).

## 4. Run the first deployment

Once these provider settings and GitHub environment values are in place, push the reviewed changes to `main`. CI runs first. The Netlify deployment waits for the protected `production` approval, then runs after approval. Keep the Netlify project private until ready for public access; the candidate health check requires the draft deploy URL to be reachable by the workflow runner. Do not add real Stripe prices or enable live payments until a production-grade database backup and availability plan is in place.

For local development, set `DATABASE_URL` and `DIRECT_URL` in `.env` to the same local Postgres connection, then use the existing Prisma scripts. `.env` is ignored by Git.

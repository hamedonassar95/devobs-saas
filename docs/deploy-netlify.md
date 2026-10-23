# Netlify Free + Neon Free deployment

This is the no-billing-account path for a demo or limited early pilot. It is not a production availability commitment: Netlify's Free tier has no SLA and can pause or remove a project, and Neon recommends paid plans when production availability guarantees are required. Do not store irreplaceable customer data here or promise continuous service on these tiers.

## Current status

- The repository has a Netlify build configuration and a GitHub Actions deploy job that waits for CI and the protected `production` environment.
- The public deployment is [courageous-croissant-3e58f9.netlify.app](https://courageous-croissant-3e58f9.netlify.app). A live check on October 22, 2026 at 20:38 UTC returned HTTP 200 for `/` and HTTP 503 with `{"status":"unavailable"}` for `/api/health`. The health route returns 503 when its PostgreSQL `SELECT 1` probe fails. This confirms the deployed database probe is failing; the public response does not identify the underlying cause. Sign-in and customer workflows were not tested.
- GitHub Actions run [39774846875](https://github.com/hamedonassar95/devobs-saas/actions/runs/39774846875) completed successfully on `main` at `98367a02bf75caef8f31fe014268fc81a1758db6`. Both CI jobs passed, while `Deploy production to Netlify` was skipped. The job condition requires `NETLIFY_DEPLOY_ENABLED=true`; its value is not readable through the current GitHub integration. The production environment has a required reviewer and a deployment branch policy for `main`.
- Google Cloud deployment is paused because the target project has no billing account. The existing Terraform and Cloud Run workflow are retained as inactive reference; CI no longer calls that deployment workflow.
- The first Neon migration initializes an empty database. It does not copy or migrate data from another environment.

The repository does not contain provider credentials. Do not mark the hosted service ready until an approved deployment completes and `/api/health` returns HTTP 200. A 503 alone does not prove whether the configured database URL is missing, incorrect, or temporarily unreachable.

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

The health endpoint records only the error class and a recognized database/network code in server logs. It never logs the raw database error message or connection URL, and it continues to return the generic `{"status":"unavailable"}` response to callers.

## 4. Run the first deployment

Once these provider settings and GitHub environment values are in place, push the reviewed changes to `main`. CI runs first. The Netlify deployment waits for the protected `production` approval, then runs after approval. Keep the Netlify project private until ready for public access; the candidate health check requires the draft deploy URL to be reachable by the workflow runner. Do not add real Stripe prices or enable live payments until a production-grade database backup and availability plan is in place.

For local development, set `DATABASE_URL` and `DIRECT_URL` in `.env` to the same local Postgres connection, then use the existing Prisma scripts. `.env` is ignored by Git.

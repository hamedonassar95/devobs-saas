# Netlify Free + Neon Free deployment

This is the no-billing-account path for a demo or limited early pilot. It is not a production availability commitment: Netlify's Free tier has no SLA and can pause or remove a project, and Neon recommends paid plans when production availability guarantees are required. Do not store irreplaceable customer data here or promise continuous service on these tiers.

## Current status

- The repository has a Netlify build configuration and a GitHub Actions deploy job that waits for CI and the protected `production` environment.
- No Netlify project, Neon database, credentials, or live deployment has been created from this workspace.
- Google Cloud deployment is paused because the target project has no billing account. The existing Terraform and Cloud Run workflow are retained as inactive reference; CI no longer calls that deployment workflow.
- The first Neon migration initializes an empty database. It does not copy or migrate data from another environment.

## Published free-tier limits checked on October 21, 2026

- Netlify's current Free plan is $0 with a 300-credit monthly hard limit and no auto-recharge. Projects pause when the account reaches its credit limit. A production deploy consumes credits, and build compute also counts, so repeated deployments can exhaust the allowance.
- Neon Free is $0/month without a credit card and currently includes 100 compute-hours and 1 GB of Postgres storage per project. Compute suspends when idle. This is a small database allowance; monitor usage and do not upgrade automatically.
- Netlify states that Free can host commercial projects, but its free tier has no service-level commitment and its terms reserve the right to suspend or remove free projects. Use this as a demo/early-pilot setup only.
- Stripe transaction processing and any paid Stripe account features are separate from hosting. Keep Stripe in test mode until prices, webhooks, support, backups, and an appropriate production hosting plan are deliberately set up.

Provider references: [Netlify pricing](https://www.netlify.com/pricing/), [Netlify free-plan limits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [Netlify Free commercial-project announcement](https://www.netlify.com/blog/introducing-netlify-free-plan/), [Neon pricing](https://neon.com/pricing), and [Neon Free plan limits](https://neon.com/blog/neon-free-plan-1-gb-per-project).

## 1. Create the provider projects

1. Create a Netlify account and choose the **Free** plan. Do not enable a paid plan or credit auto-recharge.
2. Create a Netlify project from the `hamedonassar95/devobs-saas` GitHub repository. Use `main` as the production branch. Netlify reads `netlify.toml` and `.nvmrc` from the repository.
3. Create a Neon project and keep it on the **Free** plan. Do not attach a payment method or upgrade the plan. Create an application database role with `NOSUPERUSER NOBYPASSRLS` and a strong password. The app role must own the app schema (or have the privileges needed by Prisma migrations); do not use a database superuser for the application.
4. In Neon, open **Connect** and copy two connection strings for that application role:
   - A **pooled** connection for `DATABASE_URL` (hostname contains `-pooler`).
   - A **direct/unpooled** connection for `DIRECT_URL`, used by Prisma migrations.

Keep the connection strings private. Do not paste them into chat, issues, or source files.

## 2. Configure Netlify runtime variables

In the Netlify project's environment-variable settings, set these for **Production**. On the Free plan, variables apply to all scopes by default; keep secrets out of `netlify.toml` and do not use a `NEXT_PUBLIC_` prefix.

Required to use the application:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled URL for the restricted application role |
| `APP_URL` | The HTTPS Netlify project URL, such as `https://<project>.netlify.app` |

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

Keep the optional Cloudflare Workers AI integration disabled unless its own free-plan limits and account configuration are verified. No model is called by the Netlify deploy workflow.

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

After importing the GitHub repository in Netlify, pause Netlify's automatic Git builds so they cannot publish around the GitHub `production` approval gate. GitHub Actions still performs manual CLI deploys when CI passes and a reviewer approves the `production` environment. Netlify documents that manual deploys are the way to update a project while automatic builds are stopped.

The deploy job builds the production bundle once, applies pending Prisma migrations using the direct database URL, publishes the prebuilt bundle with the Netlify CLI, and checks `/api/health`. It runs only for a push or manual dispatch on `main`, and only when `NETLIFY_DEPLOY_ENABLED=true`. A failed migration or health check fails the job; database migrations are not automatically rolled back.

## 4. Run the first deployment

Once these provider settings and GitHub environment values are in place, push the reviewed changes to `main`. CI runs first. The Netlify deployment waits for the protected `production` approval, then runs after approval. Do not add real Stripe prices or enable live payments until a production-grade database backup and availability plan is in place.

For local development, set `DATABASE_URL` and `DIRECT_URL` in `.env` to the same local Postgres connection, then use the existing Prisma scripts. `.env` is ignored by Git.

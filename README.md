
# Devobs SaaS

Multi-tenant DevOps SaaS foundation built with Next.js, TypeScript, Prisma, and PostgreSQL.

## Local setup

1. Install Node.js 20 or newer and PostgreSQL.
2. Create a non-superuser PostgreSQL application role with `NOSUPERUSER NOBYPASSRLS`, then copy `.env.example` to `.env` and set `DATABASE_URL` for that role. For a local database, an administrator can run:

   ```sql
   CREATE ROLE devobs_app LOGIN PASSWORD 'devobs_dev' NOSUPERUSER NOBYPASSRLS;
   CREATE DATABASE devobs_saas OWNER devobs_app;
   ```

   The initial migration enables and forces row-level security on tenant-owned tables.
3. Install dependencies with `npm install`.
4. Generate Prisma Client and apply migrations with `npm run db:generate` and `npm run db:migrate`.
5. Start the app with `npm run dev`.

Run checks with `npm test`, `npm run typecheck`, and `npm run lint`.

Authentication uses email and password. Passwords are hashed; sessions use opaque random tokens whose hashes are stored in PostgreSQL and are delivered in HTTP-only cookies.

Login and registration attempts are limited per normalized email in shared PostgreSQL storage (10 login attempts or 4 registration attempts per 15-minute window); successful authentication clears that email's counter. The rate-limit table stores keyed digests rather than email addresses and expires old windows opportunistically. Resource roles are enforced server-side: viewers can read, members can read/create/update, and admins or owners can also delete. Billing changes remain owner-only.

Tenant-owned record operations require active organization membership, include an organization filter, and run inside a transaction that sets a transaction-local PostgreSQL RLS context. Queries without that context fail closed. Do not connect as a superuser or a role with `BYPASSRLS` in the application runtime.

## Stripe billing (Phase 3)

Create three recurring monthly Prices in Stripe and set their IDs in `STRIPE_PRICE_MONITORING`, `STRIPE_PRICE_CICD`, and `STRIPE_PRICE_FULL`. Amounts and currencies are configured in Stripe; the application does not assume a price. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the public application origin in `APP_URL` to the server environment. Never expose Stripe secrets to browser variables.

Configure a Stripe webhook endpoint at `<APP_URL>/api/billing/webhook` for `checkout.session.completed` and `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Locally, `stripe listen --forward-to localhost:3000/api/billing/webhook` prints a webhook signing secret for `STRIPE_WEBHOOK_SECRET`. Configure the Stripe Customer Portal in the Dashboard and enable subscription cancellation (and plan changes if desired).

An organization owner can open `/billing`, choose one of the three plans, and complete Stripe Checkout. First-time subscriptions receive one 14-day trial per organization; canceled or expired organizations do not receive another trial. The signed webhook updates subscription access. A period-end cancellation remains active through the paid/trial period and access stops when Stripe reports the subscription canceled. Billing and feature checks are organization-scoped and protected by PostgreSQL RLS.

Plan access: Monitoring only includes monitoring sources and alerts; CI/CD includes CI/CD integrations; Full with AI includes monitoring, CI/CD, and AI analysis. Resource API routes return HTTP 402 when the organization lacks an active or trialing subscription with that feature.

## Free-only provider integrations

The provider API supports read-only GitHub Actions, GitLab.com, and Bitbucket Cloud pipeline history. It does not run, retry, or cancel customer jobs, and it does not store the read-only provider tokens. Prometheus Alertmanager and self-hosted Grafana OSS can deliver alerts to a tenant-specific webhook; the bearer secret is returned once at source creation and only its SHA-256 hash is stored. Alert analysis uses deterministic local rules by default. An organization owner or admin can explicitly opt in to Cloudflare Workers AI only when the application operator has configured it for a Cloudflare Workers Free account. The opt-in is off by default; the integration sends redacted alert text, makes one bounded request without retries, and never performs production actions. Usage-metered Vertex AI/Gemini, OpenAI, Datadog, CloudWatch, and Grafana Cloud integrations are not enabled.

For local development, `CLOUDFLARE_WORKERS_AI_ENABLED` and `CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED` default to `false`, and the Cloudflare account ID/token are blank. To use the model, the operator must verify that the provider account is on Workers Free, set the confirmation flag, configure the server-side provider token, and then enable the global flag. The app caps requests at five per organization and ten across the app per UTC day by default. These are request limits, not dollar budgets. An organization owner/admin can inspect `GET /api/organizations/{organizationId}/ai-settings` and enable analysis with `PATCH` and `{"enabled":true}`. The organization must have an active or trialing Full plan. Alert analysis stays local until both the global provider configuration and the organization opt-in are enabled. See [provider costs and setup](docs/provider-costs.md) for quotas, limits, monthly usage, and data handling.

See [provider costs and setup](docs/provider-costs.md) for current official pricing references, API examples, and costs that remain outside the app, including Cloud Run, PostgreSQL, and customer CI/monitoring infrastructure.

The offline [AI alert-analysis evaluation](docs/AI_EVALUATION.md) covers the SaaS response contract with synthetic cases and makes no provider calls. Its source-derived scenarios are unreviewed and do not establish model quality or production readiness.

## Marketing page and contact form (Phase 4)

The home page presents the product features, monthly plans, and 14-day trial. When `STRIPE_SECRET_KEY` and the three `STRIPE_PRICE_*` values are configured, plan amounts are read from Stripe and cached for up to one hour. If Stripe pricing is not configured or temporarily unavailable, the page says that the current amount will be confirmed at Checkout; Checkout remains the source of truth.

The contact form sends messages through Resend. Set `RESEND_API_KEY`, `CONTACT_EMAIL` (the inbox that receives inquiries), and `CONTACT_FROM_EMAIL` (a sender address verified for your Resend account). The example sender `onboarding@resend.dev` is only suitable for Resend's test setup; use an address on a verified domain for production. These are server-side values and must not be exposed with a `NEXT_PUBLIC_` prefix. The endpoint validates input, caps JSON bodies at 16 KiB, uses a hidden honeypot field, and applies PostgreSQL-backed limits of four submissions per email per ten minutes and 50 submissions across the application per day.

## Google Cloud deployment (Phase 5)

The repository includes separate production and migration containers, a GitHub Actions deployment workflow, and Terraform to prepare Google Cloud resources. It is configured for Cloud Run, Artifact Registry, Secret Manager, GitHub OIDC federation, a verified custom domain with Google-managed TLS, and Cloud Monitoring uptime alerts. The workflow deploys only from `main`; its federated identity is restricted to this repository's `main` branch.

Build the production image locally with `docker build --tag devobs-saas:local .`. If a local HTTPS-inspecting proxy requires an extra CA certificate, pass it as a temporary BuildKit secret and forward proxy settings with `docker build --secret id=npm-ca,src="$NODE_EXTRA_CA_CERTS" --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY --build-arg http_proxy --build-arg https_proxy --build-arg no_proxy --tag devobs-saas:local .`; the certificate is mounted only during dependency installation and Prisma Client generation.

### Prerequisites

- A Google Cloud project with billing enabled and an operator account allowed to enable APIs, create service accounts and Workload Identity Federation resources, grant project IAM roles, create Artifact Registry and Secret Manager resources, and configure Cloud Monitoring.
- Terraform 1.6 or newer and `gcloud` authenticated to the selected project.
- A PostgreSQL database reachable from Cloud Run. Cloud SQL is supported through its Cloud Run connector; a private-IP-only instance also needs suitable VPC networking.
- A domain you control. Domain ownership must be verified in Google Cloud before adding the Cloud Run domain mapping.

The target project ID is `tensile-verve-352716`, documented in the original Devobs repository. This setup provisions Devobs SaaS resources in that project under the names configured here. The project ID is known; the current state of its APIs, IAM permissions, database, quota, and domain has not been checked. Run cloud commands only in the owner's Google Cloud Shell, not in this development environment.

### 1. Prepare the Google Cloud resources

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

The example already selects `tensile-verve-352716`. Keep `domain_name` and `notification_email` empty for the first apply; the Cloud Run service must exist before Terraform can attach a domain. Review the plan carefully before applying: Terraform creates project resources and enabling APIs can affect billing. The owner should confirm the planned changes do not conflict with existing resources. Then apply the reviewed bootstrap plan:

```sh
terraform init
terraform plan
terraform apply
```

For the commands below, set the project variable from the Terraform output:

```sh
PROJECT_ID="$(terraform output -raw project_id)"
```

Terraform creates the Artifact Registry repository, runtime and deployer service accounts, restricted GitHub Workload Identity Federation, and empty Secret Manager entries. It also grants the runtime identity access to only the application's secrets. It does not create or store secret values.

The federation trust uses the immutable GitHub repository and owner IDs in `terraform.tfvars.example`, plus the `main` branch claim. Keep those IDs aligned with the repository that should be allowed to deploy; do not loosen the branch condition.

### 2. Add runtime values to Secret Manager

Create versions for `devobs-database-url`, `devobs-stripe-secret-key`, `devobs-stripe-webhook-secret`, and `devobs-resend-api-key`. If and only if you have reviewed the Cloudflare free-tier terms and confirmed the account remains on Workers Free, you may also create a version for `devobs-cloudflare-ai-api-token`. Supply values through standard input so they do not appear in shell history or command arguments. For example:

```sh
read -rsp 'DATABASE_URL: ' secret_value; printf '%s' "$secret_value" | gcloud secrets versions add devobs-database-url --data-file=- --project="$PROJECT_ID"; unset secret_value; printf '\n'
```

Repeat for the other three secret IDs. For Cloud SQL, set `enable_cloud_sql = true` in `terraform.tfvars` and apply Terraform, then attach the instance using the `GCP_CLOUD_SQL_INSTANCE` repository variable. Set `DATABASE_URL` to use the Cloud Run socket, for example `postgresql://devobs_app:URL_ENCODED_PASSWORD@localhost:5432/devobs_saas?schema=public&host=/cloudsql/PROJECT:REGION:INSTANCE`. Use a dedicated database role with `NOSUPERUSER NOBYPASSRLS`; make it the owner of the application database so Prisma migrations can run. Never use the Cloud SQL administrative account as the application runtime role.

### 3. Configure GitHub Actions

In the repository's **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `tensile-verve-352716` |
| `GCP_REGION` | Terraform region, for example `us-central1` |
| `GCP_ARTIFACT_REPOSITORY` | Terraform output `artifact_registry_repository` |
| `GCP_CLOUD_RUN_SERVICE` | Terraform `service_name`, normally `devobs-saas` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | Terraform output `runtime_service_account` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Terraform output `workload_identity_provider` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Terraform output `deploy_service_account` |
| `GCP_DATABASE_URL_SECRET_VERSION` | Numeric Secret Manager version containing `DATABASE_URL` |
| `GCP_STRIPE_SECRET_KEY_SECRET_VERSION` | Numeric version containing `STRIPE_SECRET_KEY` |
| `GCP_STRIPE_WEBHOOK_SECRET_VERSION` | Numeric version containing `STRIPE_WEBHOOK_SECRET` |
| `GCP_RESEND_API_KEY_SECRET_VERSION` | Numeric version containing `RESEND_API_KEY` |
| `CLOUDFLARE_WORKERS_AI_ENABLED` | Optional; `true` only after confirming the Cloudflare account is on Workers Free; otherwise leave unset or `false` |
| `CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED` | Optional operator attestation; must be `true` before the app can use the provider, and only after verifying Workers Free in Cloudflare |
| `CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_PER_ORG` | Optional per-organization request cap; defaults to `5`; accepted range is `1`–`100` |
| `CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_TOTAL` | Optional shared app-wide daily request cap; defaults to `10`; accepted range is `1`–`100` |
| `CLOUDFLARE_ACCOUNT_ID` | Required only when the optional Cloudflare AI integration is enabled |
| `GCP_CLOUDFLARE_API_TOKEN_SECRET_VERSION` | Required only when enabled; numeric Secret Manager version containing the Workers AI API token |
| `APP_URL` | Canonical public HTTPS URL for the app |
| `STRIPE_PRICE_MONITORING` | Stripe monthly Price ID for Monitoring |
| `STRIPE_PRICE_CICD` | Stripe monthly Price ID for CI/CD |
| `STRIPE_PRICE_FULL` | Stripe monthly Price ID for Full with AI |
| `CONTACT_EMAIL` | Production contact inbox |
| `CONTACT_FROM_EMAIL` | Sender verified with Resend |
| `GCP_CLOUD_SQL_INSTANCE` | Optional `PROJECT:REGION:INSTANCE` connection name |

Use positive numeric Secret Manager version numbers, not `latest`. When rotating a secret, create its new version and update its matching GitHub repository variable; the next successful deployment pins a new Cloud Run revision to that version.

The `CI` workflow now owns the production deployment dependency: on `main`, its deploy job can run only after the lint, typecheck, unit and integration tests, build, and container builds all pass. This also applies to a manually dispatched `CI` run on `main`, so adding the GCP variables later does not require an unrelated code change to deploy. It skips stale runs if `main` advances before deployment or before traffic is switched. It builds and pushes immutable images, runs `prisma migrate deploy` as a Cloud Run Job, then creates a tagged Cloud Run revision with no production traffic. The workflow checks `/api/health` through the candidate URL and shifts traffic only after the check passes, then removes the temporary candidate tag. Database migration or candidate health failure stops before production traffic is changed. The app image listens on port `8080` and runs as a non-root user.

The deployment job targets the GitHub environment named `production`. Configure required reviewers and restrict that environment to `main` in GitHub repository settings; referencing an environment in workflow YAML does not by itself enforce approval. Those settings are external to this repository and were not inspected here.

### 4. Attach the domain and enable uptime alerts

After the first deployment, set `domain_name` in `terraform.tfvars` and optionally set `notification_email`, then run `terraform plan` and `terraform apply` again. Cloud Run direct domain mapping is supported only in `asia-east1`, `asia-northeast1`, `asia-southeast1`, `europe-north1`, `europe-west1`, `europe-west4`, `us-central1`, `us-east1`, `us-east4`, and `us-west1`; Terraform rejects other regions when a custom domain is configured. Add the DNS records shown by `terraform output domain_mapping_records` at your DNS provider. Cloud Run provisions and renews the HTTPS certificate after the records resolve. If an email notification channel is configured, verify it with Google Cloud Monitoring.

The uptime check requests `https://<domain>/api/health` every minute from multiple regions. The endpoint returns `200` only when PostgreSQL responds, and returns a generic `503` otherwise; it does not return database details. The alert opens after the check has failed for two minutes.

Finally, configure the Stripe webhook URL as `https://<domain>/api/billing/webhook` for the event types documented above. Set `APP_URL` to the same origin so Checkout and Customer Portal links use HTTPS.

### Deployment status

This repository contains deployment configuration only. The target project ID is `tensile-verve-352716`; infrastructure provisioning and deployment still require the owner to run the Cloud Shell steps, provide a PostgreSQL connection and application secrets through the documented secret store, and configure a verified production domain for custom-domain HTTPS and uptime monitoring. The service has not been deployed from this environment.

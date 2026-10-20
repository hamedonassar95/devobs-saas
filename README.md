
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

Tenant-owned record operations require active organization membership, include an organization filter, and run inside a transaction that sets a transaction-local PostgreSQL RLS context. Queries without that context fail closed. Do not connect as a superuser or a role with `BYPASSRLS` in the application runtime.

## Stripe billing (Phase 3)

Create three recurring monthly Prices in Stripe and set their IDs in `STRIPE_PRICE_MONITORING`, `STRIPE_PRICE_CICD`, and `STRIPE_PRICE_FULL`. Amounts and currencies are configured in Stripe; the application does not assume a price. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the public application origin in `APP_URL` to the server environment. Never expose Stripe secrets to browser variables.

Configure a Stripe webhook endpoint at `<APP_URL>/api/billing/webhook` for `checkout.session.completed` and `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Locally, `stripe listen --forward-to localhost:3000/api/billing/webhook` prints a webhook signing secret for `STRIPE_WEBHOOK_SECRET`. Configure the Stripe Customer Portal in the Dashboard and enable subscription cancellation (and plan changes if desired).

An organization owner can open `/billing`, choose one of the three plans, and complete Stripe Checkout. First-time subscriptions receive one 14-day trial per organization; canceled or expired organizations do not receive another trial. The signed webhook updates subscription access. A period-end cancellation remains active through the paid/trial period and access stops when Stripe reports the subscription canceled. Billing and feature checks are organization-scoped and protected by PostgreSQL RLS.

Plan access: Monitoring only includes monitoring sources and alerts; CI/CD includes CI/CD integrations; Full with AI includes monitoring, CI/CD, and AI analysis. Resource API routes return HTTP 402 when the organization lacks an active or trialing subscription with that feature.

## Marketing page and contact form (Phase 4)

The home page presents the product features, monthly plans, and 14-day trial. When `STRIPE_SECRET_KEY` and the three `STRIPE_PRICE_*` values are configured, plan amounts are read from Stripe and cached for up to one hour. If Stripe pricing is not configured or temporarily unavailable, the page says that the current amount will be confirmed at Checkout; Checkout remains the source of truth.

The contact form sends messages through Resend. Set `RESEND_API_KEY`, `CONTACT_EMAIL` (the inbox that receives inquiries), and `CONTACT_FROM_EMAIL` (a sender address verified for your Resend account). The example sender `onboarding@resend.dev` is only suitable for Resend's test setup; use an address on a verified domain for production. These are server-side values and must not be exposed with a `NEXT_PUBLIC_` prefix. The endpoint validates input, uses a hidden honeypot field, and limits repeated submissions per server instance.

## Google Cloud deployment (Phase 5)

The repository includes separate production and migration containers, a GitHub Actions deployment workflow, and Terraform to prepare Google Cloud resources. It is configured for Cloud Run, Artifact Registry, Secret Manager, GitHub OIDC federation, a verified custom domain with Google-managed TLS, and Cloud Monitoring uptime alerts. The workflow deploys only from `main`; its federated identity is restricted to this repository's `main` branch.

Build the production image locally with `docker build --tag devobs-saas:local .`. If a local HTTPS-inspecting proxy requires an extra CA certificate, pass it as a temporary BuildKit secret and forward proxy settings with `docker build --secret id=npm-ca,src="$NODE_EXTRA_CA_CERTS" --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY --build-arg http_proxy --build-arg https_proxy --build-arg no_proxy --tag devobs-saas:local .`; the certificate is mounted only during dependency installation and Prisma Client generation.

### Prerequisites

- A Google Cloud project with billing enabled and an operator account allowed to enable APIs, create service accounts and Workload Identity Federation resources, grant project IAM roles, create Artifact Registry and Secret Manager resources, and configure Cloud Monitoring.
- Terraform 1.6 or newer and `gcloud` authenticated to the selected project.
- A PostgreSQL database reachable from Cloud Run. Cloud SQL is supported through its Cloud Run connector; a private-IP-only instance also needs suitable VPC networking.
- A domain you control. Domain ownership must be verified in Google Cloud before adding the Cloud Run domain mapping.

The Google Cloud project ID was not present in `AGENTS.md` when this setup was prepared. Obtain the intended project ID from the project owner; do not replace it with a guessed value.

### 1. Prepare the Google Cloud resources

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Set `project_id` in the ignored `terraform.tfvars`. Keep `domain_name` and `notification_email` empty for the first apply; the Cloud Run service must exist before Terraform can attach a domain. Then review and apply the bootstrap resources:

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

### 2. Add runtime values to Secret Manager

Create versions for `devobs-database-url`, `devobs-stripe-secret-key`, `devobs-stripe-webhook-secret`, and `devobs-resend-api-key`. Supply values through standard input so they do not appear in shell history or command arguments. For example:

```sh
read -rsp 'DATABASE_URL: ' secret_value; printf '%s' "$secret_value" | gcloud secrets versions add devobs-database-url --data-file=- --project="$PROJECT_ID"; unset secret_value; printf '\n'
```

Repeat for the other three secret IDs. For Cloud SQL, set `enable_cloud_sql = true` in `terraform.tfvars` and apply Terraform, then attach the instance using the `GCP_CLOUD_SQL_INSTANCE` repository variable. Set `DATABASE_URL` to use the Cloud Run socket, for example `postgresql://devobs_app:URL_ENCODED_PASSWORD@localhost:5432/devobs_saas?schema=public&host=/cloudsql/PROJECT:REGION:INSTANCE`. Use a dedicated database role with `NOSUPERUSER NOBYPASSRLS`; make it the owner of the application database so Prisma migrations can run. Never use the Cloud SQL administrative account as the application runtime role.

### 3. Configure GitHub Actions

In the repository's **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value |
| --- | --- |
| `GCP_PROJECT_ID` | The owner-provided project ID |
| `GCP_REGION` | Terraform region, for example `us-central1` |
| `GCP_ARTIFACT_REPOSITORY` | Terraform output `artifact_registry_repository` |
| `GCP_CLOUD_RUN_SERVICE` | Terraform `service_name`, normally `devobs-saas` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | Terraform output `runtime_service_account` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Terraform output `workload_identity_provider` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Terraform output `deploy_service_account` |
| `APP_URL` | Canonical public HTTPS URL for the app |
| `STRIPE_PRICE_MONITORING` | Stripe monthly Price ID for Monitoring |
| `STRIPE_PRICE_CICD` | Stripe monthly Price ID for CI/CD |
| `STRIPE_PRICE_FULL` | Stripe monthly Price ID for Full with AI |
| `CONTACT_EMAIL` | Production contact inbox |
| `CONTACT_FROM_EMAIL` | Sender verified with Resend |
| `GCP_CLOUD_SQL_INSTANCE` | Optional `PROJECT:REGION:INSTANCE` connection name |

After configuration, a push to `main` builds and pushes an immutable image, runs `prisma migrate deploy` as a Cloud Run Job, then deploys the application to Cloud Run. Database migration failure stops the release before the new application revision is deployed. The app image listens on port `8080` and runs as a non-root user.

### 4. Attach the domain and enable uptime alerts

After the first deployment, set `domain_name` in `terraform.tfvars` and optionally set `notification_email`, then run `terraform plan` and `terraform apply` again. Add the DNS records shown by `terraform output domain_mapping_records` at your DNS provider. Cloud Run provisions and renews the HTTPS certificate after the records resolve. If an email notification channel is configured, verify it with Google Cloud Monitoring.

The uptime check requests `https://<domain>/api/health` every minute from multiple regions. The endpoint returns `200` only when PostgreSQL responds, and returns a generic `503` otherwise; it does not return database details. The alert opens after the check has failed for two minutes.

Finally, configure the Stripe webhook URL as `https://<domain>/api/billing/webhook` for the event types documented above. Set `APP_URL` to the same origin so Checkout and Customer Portal links use HTTPS.

### Deployment status

This repository contains deployment configuration only. A Google Cloud project ID, an authenticated Google Cloud deployment context, and the production domain are required before infrastructure can be provisioned or the service can be deployed.

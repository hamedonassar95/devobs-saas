
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

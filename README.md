
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

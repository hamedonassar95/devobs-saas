-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CiCdProvider" AS ENUM ('GITHUB', 'GITLAB', 'BITBUCKET', 'OTHER');

-- CreateEnum
CREATE TYPE "MonitoringProvider" AS ENUM ('PROMETHEUS', 'DATADOG', 'GRAFANA', 'CLOUDWATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cicd_integrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "CiCdProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cicd_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_sources" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "MonitoringProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT,
    "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "alertId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_id_slug_key" ON "organizations"("id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_userId_status_idx" ON "memberships"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_expiresAt_idx" ON "sessions"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "cicd_integrations_organizationId_status_idx" ON "cicd_integrations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cicd_integrations_organizationId_id_key" ON "cicd_integrations"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cicd_integrations_organizationId_provider_repositoryUrl_key" ON "cicd_integrations"("organizationId", "provider", "repositoryUrl");

-- CreateIndex
CREATE INDEX "monitoring_sources_organizationId_status_idx" ON "monitoring_sources"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_sources_organizationId_id_key" ON "monitoring_sources"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_sources_organizationId_provider_name_key" ON "monitoring_sources"("organizationId", "provider", "name");

-- CreateIndex
CREATE INDEX "alerts_organizationId_status_severity_idx" ON "alerts"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "alerts_organizationId_sourceId_idx" ON "alerts"("organizationId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_organizationId_id_key" ON "alerts"("organizationId", "id");

-- CreateIndex
CREATE INDEX "analysis_results_organizationId_createdAt_idx" ON "analysis_results"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "analysis_results_organizationId_alertId_idx" ON "analysis_results"("organizationId", "alertId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_results_organizationId_id_key" ON "analysis_results"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cicd_integrations" ADD CONSTRAINT "cicd_integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_sources" ADD CONSTRAINT "monitoring_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organizationId_sourceId_fkey" FOREIGN KEY ("organizationId", "sourceId") REFERENCES "monitoring_sources"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_organizationId_alertId_fkey" FOREIGN KEY ("organizationId", "alertId") REFERENCES "alerts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant resources fail closed unless the request sets a transaction-local organization context.
ALTER TABLE "cicd_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cicd_integrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cicd_integrations_tenant_isolation" ON "cicd_integrations"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "monitoring_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monitoring_sources" FORCE ROW LEVEL SECURITY;
CREATE POLICY "monitoring_sources_tenant_isolation" ON "monitoring_sources"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alerts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "alerts_tenant_isolation" ON "alerts"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "analysis_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analysis_results" FORCE ROW LEVEL SECURITY;
CREATE POLICY "analysis_results_tenant_isolation" ON "analysis_results"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));


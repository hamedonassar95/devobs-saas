ALTER TABLE "alerts" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "alerts_organizationId_sourceId_externalId_key"
  ON "alerts"("organizationId", "sourceId", "externalId");

CREATE TABLE "monitoring_webhook_credentials" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "monitoring_webhook_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "monitoring_webhook_credentials_tokenHash_key"
  ON "monitoring_webhook_credentials"("tokenHash");
CREATE UNIQUE INDEX "monitoring_webhook_credentials_organizationId_sourceId_key"
  ON "monitoring_webhook_credentials"("organizationId", "sourceId");

ALTER TABLE "monitoring_webhook_credentials"
  ADD CONSTRAINT "monitoring_webhook_credentials_organizationId_sourceId_fkey"
  FOREIGN KEY ("organizationId", "sourceId")
  REFERENCES "monitoring_sources"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "monitoring_webhook_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monitoring_webhook_credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY "monitoring_webhook_credentials_tenant_isolation" ON "monitoring_webhook_credentials"
  USING ("organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incident_alerts" (
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "linkReason" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_alerts_pkey" PRIMARY KEY ("organizationId", "incidentId", "alertId")
);

CREATE UNIQUE INDEX "incidents_organizationId_id_key" ON "incidents"("organizationId", "id");
CREATE INDEX "incidents_organizationId_status_openedAt_idx" ON "incidents"("organizationId", "status", "openedAt");
CREATE INDEX "incident_alerts_organizationId_alertId_idx" ON "incident_alerts"("organizationId", "alertId");

ALTER TABLE "incidents"
    ADD CONSTRAINT "incidents_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incidents"
    ADD CONSTRAINT "incidents_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidents"
    ADD CONSTRAINT "incidents_resolvedByUserId_fkey"
    FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incident_alerts"
    ADD CONSTRAINT "incident_alerts_organizationId_incidentId_fkey"
    FOREIGN KEY ("organizationId", "incidentId") REFERENCES "incidents"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_alerts"
    ADD CONSTRAINT "incident_alerts_organizationId_alertId_fkey"
    FOREIGN KEY ("organizationId", "alertId") REFERENCES "alerts"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_alerts"
    ADD CONSTRAINT "incident_alerts_linkedByUserId_fkey"
    FOREIGN KEY ("linkedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incidents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "incidents_tenant_isolation" ON "incidents"
    USING ("organizationId" = current_setting('app.current_organization_id', true))
    WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "incident_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_alerts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "incident_alerts_tenant_isolation" ON "incident_alerts"
    USING ("organizationId" = current_setting('app.current_organization_id', true))
    WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

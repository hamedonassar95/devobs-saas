CREATE TABLE "github_app_installations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "workflowsWriteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_app_installations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_app_installations_organizationId_key" ON "github_app_installations"("organizationId");
CREATE UNIQUE INDEX "github_app_installations_installationId_key" ON "github_app_installations"("installationId");

ALTER TABLE "github_app_installations"
    ADD CONSTRAINT "github_app_installations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "github_app_installations"
    ADD CONSTRAINT "github_app_installations_connectedByUserId_fkey"
    FOREIGN KEY ("connectedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "github_app_installations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "github_app_installations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "github_app_installations_tenant_isolation" ON "github_app_installations"
    USING ("organizationId" = current_setting('app.current_organization_id', true))
    WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

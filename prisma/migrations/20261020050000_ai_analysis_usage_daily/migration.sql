CREATE TABLE "ai_analysis_usage_daily" (
    "organizationId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "totalLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_analysis_usage_daily_pkey" PRIMARY KEY ("organizationId", "day"),
    CONSTRAINT "ai_analysis_usage_daily_nonnegative_check" CHECK (
        "requests" >= 0 AND "succeeded" >= 0 AND "failed" >= 0 AND "totalLatencyMs" >= 0
    ),
    CONSTRAINT "ai_analysis_usage_daily_organizationId_fkey" FOREIGN KEY ("organizationId")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "ai_analysis_usage_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_analysis_usage_daily" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_analysis_usage_daily_tenant_isolation" ON "ai_analysis_usage_daily"
    USING ("organizationId" = current_setting('app.current_organization_id', true))
    WITH CHECK ("organizationId" = current_setting('app.current_organization_id', true));

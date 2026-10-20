-- Platform-wide aggregate only: no tenant IDs, alert content, or credentials are stored here.
CREATE TABLE "ai_provider_usage_daily" (
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "totalLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_usage_daily_pkey" PRIMARY KEY ("day"),
    CONSTRAINT "ai_provider_usage_daily_nonnegative_check" CHECK (
        "requests" >= 0 AND "succeeded" >= 0 AND "failed" >= 0 AND "totalLatencyMs" >= 0
    )
);

ALTER TABLE "ai_provider_usage_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_provider_usage_daily" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ai_provider_usage_daily_requires_tenant_context" ON "ai_provider_usage_daily"
    USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL)
    WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NOT NULL);

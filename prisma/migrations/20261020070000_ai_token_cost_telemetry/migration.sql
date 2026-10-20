ALTER TABLE "ai_analysis_usage_daily"
    ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "usageReports" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "estimatedCostNanoUsd" BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT "ai_analysis_usage_daily_token_cost_check" CHECK (
        "inputTokens" >= 0 AND "outputTokens" >= 0 AND "usageReports" >= 0
        AND "usageReports" <= "succeeded" AND "estimatedCostNanoUsd" >= 0
    );

ALTER TABLE "ai_provider_usage_daily"
    ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "usageReports" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "estimatedCostNanoUsd" BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT "ai_provider_usage_daily_token_cost_check" CHECK (
        "inputTokens" >= 0 AND "outputTokens" >= 0 AND "usageReports" >= 0
        AND "usageReports" <= "succeeded" AND "estimatedCostNanoUsd" >= 0
    );

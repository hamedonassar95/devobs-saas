CREATE TABLE "auth_attempt_limits" (
    "keyHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_attempt_limits_pkey" PRIMARY KEY ("keyHash"),
    CONSTRAINT "auth_attempt_limits_attempts_positive" CHECK ("attempts" > 0)
);

CREATE INDEX "auth_attempt_limits_windowStartedAt_idx" ON "auth_attempt_limits"("windowStartedAt");

ALTER TABLE "users"
ADD COLUMN "emailVerificationRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "pending_registrations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_registrations_email_key"
ON "pending_registrations"("email");

CREATE UNIQUE INDEX "pending_registrations_tokenHash_key"
ON "pending_registrations"("tokenHash");

CREATE INDEX "pending_registrations_expiresAt_idx"
ON "pending_registrations"("expiresAt");

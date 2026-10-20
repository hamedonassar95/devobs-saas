import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const RATE_LIMITS = {
  login: { maxAttempts: 10, windowMs: 15 * MINUTE },
  register: { maxAttempts: 4, windowMs: 15 * MINUTE },
  contactEmail: { maxAttempts: 4, windowMs: 10 * MINUTE },
  contactGlobal: { maxAttempts: 50, windowMs: DAY },
} as const;

export type AuthRateLimitAction = keyof typeof RATE_LIMITS;
type AuthRateLimitClient = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

type AttemptRow = {
  attempts: number;
  windowStartedAt: Date;
};

function createKeyHash(action: AuthRateLimitAction, email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for authentication throttling");
  return createHmac("sha256", databaseUrl)
    .update(`devobs-auth-rate-limit:v1\0${action}\0${normalizedEmail}`)
    .digest("hex");
}

export async function consumeAuthAttempt(
  action: AuthRateLimitAction,
  email: string,
  client: AuthRateLimitClient = prisma,
  now = new Date(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const keyHash = createKeyHash(action, email);
  const expiredBefore = new Date(now.getTime() - RATE_LIMITS[action].windowMs);
  if ((Number.parseInt(keyHash.slice(0, 2), 16) & 0x3f) === 0) {
    const staleBefore = new Date(now.getTime() - DAY);
    await client.$executeRaw`
      DELETE FROM "auth_attempt_limits"
      WHERE "windowStartedAt" <= ${staleBefore}
    `;
  }
  const rows = await client.$queryRaw<AttemptRow[]>`
    INSERT INTO "auth_attempt_limits" ("keyHash", "attempts", "windowStartedAt", "updatedAt")
    VALUES (${keyHash}, 1, ${now}, ${now})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "attempts" = CASE
        WHEN "auth_attempt_limits"."windowStartedAt" <= ${expiredBefore} THEN 1
        ELSE "auth_attempt_limits"."attempts" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "auth_attempt_limits"."windowStartedAt" <= ${expiredBefore} THEN ${now}
        ELSE "auth_attempt_limits"."windowStartedAt"
      END,
      "updatedAt" = ${now}
    WHERE "auth_attempt_limits"."windowStartedAt" <= ${expiredBefore}
       OR "auth_attempt_limits"."attempts" < ${RATE_LIMITS[action].maxAttempts}
    RETURNING "attempts", "windowStartedAt"
  `;

  const attempt = rows[0];
  if (!attempt) {
    const current = await client.$queryRaw<AttemptRow[]>`
      SELECT "attempts", "windowStartedAt"
      FROM "auth_attempt_limits"
      WHERE "keyHash" = ${keyHash}
    `;
    const blocked = current[0];
    if (!blocked) throw new Error("Could not record rate limit attempt");
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((blocked.windowStartedAt.getTime() + RATE_LIMITS[action].windowMs - now.getTime()) / 1000)),
    };
  }
  const allowed = attempt.attempts <= RATE_LIMITS[action].maxAttempts;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((attempt.windowStartedAt.getTime() + RATE_LIMITS[action].windowMs - now.getTime()) / 1000));

  return { allowed, retryAfterSeconds };
}

export async function resetAuthAttempts(
  action: AuthRateLimitAction,
  email: string,
  client: AuthRateLimitClient = prisma,
): Promise<void> {
  const keyHash = createKeyHash(action, email);
  await client.$executeRaw`DELETE FROM "auth_attempt_limits" WHERE "keyHash" = ${keyHash}`;
}

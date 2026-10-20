import type { Prisma } from "@prisma/client";

export const DEFAULT_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION = 5;
export const MAX_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION = 100;

export type AiProviderOutcome = "succeeded" | "failed";

export function getUtcDayStart(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getDailyAiRequestLimit(env: Readonly<Record<string, string | undefined>> = process.env): number | null {
  const raw = env.CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_PER_ORG?.trim();
  if (!raw) return DEFAULT_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION) return null;
  return parsed;
}

function dayAsSqlDate(day: Date): string {
  return getUtcDayStart(day).toISOString().slice(0, 10);
}

export async function reserveAiAnalysisRequest(
  tx: Prisma.TransactionClient,
  organizationId: string,
  day: Date,
  dailyLimit: number,
): Promise<number | null> {
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > MAX_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION) {
    throw new RangeError("AI daily request limit is invalid");
  }

  const sqlDay = dayAsSqlDate(day);
  const rows = await tx.$queryRaw<Array<{ requests: number }>>`
    INSERT INTO "ai_analysis_usage_daily" ("organizationId", "day", "requests", "createdAt", "updatedAt")
    VALUES (${organizationId}, ${sqlDay}::date, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("organizationId", "day")
    DO UPDATE SET
      "requests" = "ai_analysis_usage_daily"."requests" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "ai_analysis_usage_daily"."requests" < ${dailyLimit}
    RETURNING "requests"
  `;

  return rows[0]?.requests ?? null;
}

export async function recordAiAnalysisOutcome(
  tx: Prisma.TransactionClient,
  organizationId: string,
  day: Date,
  outcome: AiProviderOutcome,
  latencyMs: number,
): Promise<void> {
  const boundedLatencyMs = Math.max(0, Math.min(MAX_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION * 60_000, Math.round(latencyMs)));
  await tx.aiAnalysisUsageDaily.update({
    where: { organizationId_day: { organizationId, day: getUtcDayStart(day) } },
    data: {
      [outcome]: { increment: 1 },
      totalLatencyMs: { increment: boundedLatencyMs },
    },
  });
}

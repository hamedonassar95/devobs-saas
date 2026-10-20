import type { Prisma } from "@prisma/client";

export const DEFAULT_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION = 5;
export const MAX_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION = 100;
export const DEFAULT_DAILY_AI_REQUEST_LIMIT_PLATFORM = 10;
export const MAX_DAILY_AI_REQUEST_LIMIT_PLATFORM = 100;

export type AiProviderOutcome = "succeeded" | "failed";

export type AiTokenUsage = {
  promptTokens: number;
  completionTokens: number;
};

// Cloudflare model-page rates checked on 2026-10-20 for the pinned model.
// Nano-USD keeps the per-token estimate exact without floating-point writes.
export const CLOUDFLARE_AI_PRICING_CHECKED_ON = "2026-10-20";
const CLOUDFLARE_INPUT_NANO_USD_PER_TOKEN = 152;
const CLOUDFLARE_OUTPUT_NANO_USD_PER_TOKEN = 287;

export function estimateAiCostNanoUsd(usage: AiTokenUsage): bigint {
  return BigInt(usage.promptTokens) * BigInt(CLOUDFLARE_INPUT_NANO_USD_PER_TOKEN)
    + BigInt(usage.completionTokens) * BigInt(CLOUDFLARE_OUTPUT_NANO_USD_PER_TOKEN);
}

export function summarizeAiCostEstimate(
  requestsReserved: number,
  usageReports: number,
  estimatedCostNanoUsd: bigint,
): { costEstimateUsd: number | null; usageCoveragePercent: number | null; costEstimateComplete: boolean } {
  const costEstimateComplete = usageReports === requestsReserved;
  return {
    costEstimateUsd: costEstimateComplete ? Number(estimatedCostNanoUsd) / 1_000_000_000 : null,
    usageCoveragePercent: requestsReserved === 0 ? null : Math.round((usageReports / requestsReserved) * 100),
    costEstimateComplete,
  };
}

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

export function getPlatformDailyAiRequestLimit(env: Readonly<Record<string, string | undefined>> = process.env): number | null {
  const raw = env.CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_TOTAL?.trim();
  if (!raw) return DEFAULT_DAILY_AI_REQUEST_LIMIT_PLATFORM;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_DAILY_AI_REQUEST_LIMIT_PLATFORM) return null;
  return parsed;
}

function dayAsSqlDate(day: Date): string {
  return getUtcDayStart(day).toISOString().slice(0, 10);
}

export async function reserveAiAnalysisRequest(
  tx: Prisma.TransactionClient,
  organizationId: string,
  day: Date,
  organizationDailyLimit: number,
  platformDailyLimit: number,
): Promise<number | null> {
  if (!Number.isSafeInteger(organizationDailyLimit) || organizationDailyLimit < 1 || organizationDailyLimit > MAX_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION) {
    throw new RangeError("AI organization daily request limit is invalid");
  }
  if (!Number.isSafeInteger(platformDailyLimit) || platformDailyLimit < 1 || platformDailyLimit > MAX_DAILY_AI_REQUEST_LIMIT_PLATFORM) {
    throw new RangeError("AI platform daily request limit is invalid");
  }

  const sqlDay = dayAsSqlDate(day);
  await tx.$executeRaw`SAVEPOINT ai_usage_reservation`;
  const platformRows = await tx.$queryRaw<Array<{ requests: number }>>`
    INSERT INTO "ai_provider_usage_daily" ("day", "requests", "createdAt", "updatedAt")
    VALUES (${sqlDay}::date, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("day")
    DO UPDATE SET
      "requests" = "ai_provider_usage_daily"."requests" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "ai_provider_usage_daily"."requests" < ${platformDailyLimit}
    RETURNING "requests"
  `;
  if (!platformRows[0]) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT ai_usage_reservation`;
    await tx.$executeRaw`RELEASE SAVEPOINT ai_usage_reservation`;
    return null;
  }

  const rows = await tx.$queryRaw<Array<{ requests: number }>>`
    INSERT INTO "ai_analysis_usage_daily" ("organizationId", "day", "requests", "createdAt", "updatedAt")
    VALUES (${organizationId}, ${sqlDay}::date, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("organizationId", "day")
    DO UPDATE SET
      "requests" = "ai_analysis_usage_daily"."requests" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "ai_analysis_usage_daily"."requests" < ${organizationDailyLimit}
    RETURNING "requests"
  `;

  if (!rows[0]) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT ai_usage_reservation`;
    await tx.$executeRaw`RELEASE SAVEPOINT ai_usage_reservation`;
    return null;
  }
  await tx.$executeRaw`RELEASE SAVEPOINT ai_usage_reservation`;
  return rows[0].requests;
}

export async function recordAiAnalysisOutcome(
  tx: Prisma.TransactionClient,
  organizationId: string,
  day: Date,
  outcome: AiProviderOutcome,
  latencyMs: number,
  tokenUsage: AiTokenUsage | null,
): Promise<void> {
  const boundedLatencyMs = Math.max(0, Math.min(MAX_DAILY_AI_REQUEST_LIMIT_PER_ORGANIZATION * 60_000, Math.round(latencyMs)));
  const tokenMetrics = tokenUsage ? {
    inputTokens: { increment: tokenUsage.promptTokens },
    outputTokens: { increment: tokenUsage.completionTokens },
    usageReports: { increment: 1 },
    estimatedCostNanoUsd: { increment: estimateAiCostNanoUsd(tokenUsage) },
  } : {};
  await tx.aiAnalysisUsageDaily.update({
    where: { organizationId_day: { organizationId, day: getUtcDayStart(day) } },
    data: {
      [outcome]: { increment: 1 },
      totalLatencyMs: { increment: boundedLatencyMs },
      ...tokenMetrics,
    },
  });
  await tx.aiProviderUsageDaily.update({
    where: { day: getUtcDayStart(day) },
    data: {
      [outcome]: { increment: 1 },
      totalLatencyMs: { increment: boundedLatencyMs },
      ...tokenMetrics,
    },
  });
}

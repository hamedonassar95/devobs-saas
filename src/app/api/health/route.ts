import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeDatabaseErrorDetails(error: unknown) {
  const safeErrorNames = new Set([
    "Error",
    "TypeError",
    "PrismaClientInitializationError",
    "PrismaClientKnownRequestError",
    "PrismaClientUnknownRequestError",
    "PrismaClientRustPanicError",
    "PrismaClientValidationError",
  ]);
  const errorName =
    error instanceof Error && safeErrorNames.has(error.name)
      ? error.name
      : "UnknownError";
  const safeCodePattern =
    /^(?:P\d{4}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|EAI_AGAIN|ENOTFOUND)$/;

  // Prisma may wrap the underlying connection error, so inspect only a few
  // `cause` levels and only return allow-listed error codes.
  let current: unknown = error;
  let errorCode: string | undefined;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "object" || current === null) break;

    const record = current as Record<string, unknown>;
    const explicitCode =
      typeof record.errorCode === "string"
        ? record.errorCode
        : typeof record.code === "string"
          ? record.code
          : undefined;
    const message = typeof record.message === "string" ? record.message.slice(0, 2048) : "";
    // Some Prisma initialization errors include a safe Prisma or network code
    // only in their message. Extract the token, never connection details.
    const messageCode = message
      .match(
        /\b(P\d{4}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|EAI_AGAIN|ENOTFOUND)\b/i,
      )?.[1]
      .toUpperCase();
    const candidateCode = explicitCode ?? messageCode;

    if (candidateCode && safeCodePattern.test(candidateCode)) {
      errorCode = candidateCode;
      break;
    }

    current = record.cause;
  }

  return errorCode ? { errorName, errorCode } : { errorName };
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Log only safe metadata. Never log DATABASE_URL or the raw Prisma error.
    console.error(
      "[health] Database connectivity check failed; returning HTTP 503.",
      JSON.stringify({
        event: "health_check.database_probe_failed",
        databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
        ...safeDatabaseErrorDetails(error),
      }),
    );
    return NextResponse.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

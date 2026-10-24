import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DatabaseErrorCategory =
  | "authentication"
  | "permissions"
  | "connectivity"
  | "timeout"
  | "database_missing"
  | "tls"
  | "connection_capacity"
  | "configuration";

function safeDatabaseUrlDetails(databaseUrl: string | undefined) {
  const value = databaseUrl?.trim() ?? "";
  if (!value) {
    return {
      databaseUrlConfigured: false,
      databaseUrlHasPostgresSchemeAndHost: false,
      databaseUrlLooksPooled: false,
    };
  }

  try {
    const parsed = new URL(value);
    const databaseUrlHasPostgresSchemeAndHost =
      (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") &&
      parsed.hostname.length > 0;
    return {
      databaseUrlConfigured: true,
      databaseUrlHasPostgresSchemeAndHost,
      databaseUrlLooksPooled:
        databaseUrlHasPostgresSchemeAndHost && /-pooler(?:\.|$)/i.test(parsed.hostname),
    };
  } catch {
    return {
      databaseUrlConfigured: true,
      databaseUrlHasPostgresSchemeAndHost: false,
      databaseUrlLooksPooled: false,
    };
  }
}

function categoryForCode(code: string): DatabaseErrorCategory | undefined {
  switch (code) {
    case "P1000":
      return "authentication";
    case "P1010":
      return "permissions";
    case "P1001":
    case "P1017":
    case "ECONNREFUSED":
    case "ECONNRESET":
    case "EHOSTUNREACH":
    case "EAI_AGAIN":
    case "ENOTFOUND":
      return "connectivity";
    case "P1002":
    case "P1008":
    case "ETIMEDOUT":
      return "timeout";
    case "P1003":
      return "database_missing";
    case "P1011":
      return "tls";
    case "P2024":
      return "connection_capacity";
    default:
      return undefined;
  }
}

function categoryForMessage(message: string): DatabaseErrorCategory | undefined {
  const normalized = message.toLowerCase();
  if (/authentication failed|password authentication failed|tenant or user not found/.test(normalized)) {
    return "authentication";
  }
  if (/denied access|access denied|permission denied/.test(normalized)) return "permissions";
  if (/can't reach database server|cannot reach database server|could not connect to server|connection refused|server has closed the connection/.test(normalized)) {
    return "connectivity";
  }
  if (/timed out|timeout fetching|operation timed out/.test(normalized)) return "timeout";
  if (/tls|ssl|certificate verify failed|self.signed certificate/.test(normalized)) return "tls";
  if (/database .{0,100} does not exist|database not found/.test(normalized)) return "database_missing";
  if (/too many connections|connection pool.*(full|timeout|timed out)/.test(normalized)) {
    return "connection_capacity";
  }
  if (/environment variable not found|invalid (?:database )?url|connection string is invalid/.test(normalized)) {
    return "configuration";
  }
  return undefined;
}

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
  let errorCategory: DatabaseErrorCategory | undefined;
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
      )?.[1];
    const candidateCode = (explicitCode ?? messageCode)?.toUpperCase();

    if (candidateCode && safeCodePattern.test(candidateCode)) {
      errorCode = candidateCode;
      errorCategory = categoryForCode(candidateCode) ?? errorCategory;
    }
    errorCategory ??= categoryForMessage(message);

    current = record.cause;
  }

  return {
    errorName,
    ...(errorCode ? { errorCode } : {}),
    ...(errorCategory ? { errorCategory } : {}),
  };
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
        ...safeDatabaseUrlDetails(process.env.DATABASE_URL),
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

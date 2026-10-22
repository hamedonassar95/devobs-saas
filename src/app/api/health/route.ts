import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeDatabaseErrorDetails(error: unknown) {
  const errorName =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/.test(error.name)
      ? error.name
      : "UnknownError";
  const record = typeof error === "object" && error !== null ? error : undefined;
  const candidateCode =
    record && "errorCode" in record && typeof record.errorCode === "string"
      ? record.errorCode
      : record && "code" in record && typeof record.code === "string"
        ? record.code
        : undefined;
  const errorCode =
    candidateCode &&
    /^(?:P\d{4}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|EAI_AGAIN|ENOTFOUND)$/.test(
      candidateCode,
    )
      ? candidateCode
      : undefined;

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
    // Keep connection strings and raw database error messages out of logs and responses.
    console.error("Health check database probe failed", safeDatabaseErrorDetails(error));
    return NextResponse.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

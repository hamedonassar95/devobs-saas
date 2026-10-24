import { NextResponse } from "next/server";
import { credentialsSchema } from "@/lib/auth/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { consumeAuthAttempt, resetAuthAttempts } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { readBoundedJson } from "@/lib/http/bounded-json";

const NO_STORE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 8 * 1024);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The sign-in request is too large." }, { status: 413, headers: NO_STORE_HEADERS });
  }
  const parsed = credentialsSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password." }, { status: 400, headers: NO_STORE_HEADERS });

  const email = parsed.data.email.trim().toLowerCase();
  const limit = await consumeAuthAttempt("login", email);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401, headers: NO_STORE_HEADERS });
  }
  if (user.emailVerificationRequired && !user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Verify your email before signing in.", code: "EMAIL_NOT_VERIFIED" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  await resetAuthAttempts("login", email);
  await createSession(user.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

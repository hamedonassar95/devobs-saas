import { NextResponse } from "next/server";
import { credentialsSchema } from "@/lib/auth/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { consumeAuthAttempt, resetAuthAttempts } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { readBoundedJson } from "@/lib/http/bounded-json";

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 8 * 1024);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The sign-in request is too large." }, { status: 413 });
  }
  const parsed = credentialsSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const limit = await consumeAuthAttempt("login", email);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  await resetAuthAttempts("login", email);
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}

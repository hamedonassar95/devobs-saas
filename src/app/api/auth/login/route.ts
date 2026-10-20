import { NextResponse } from "next/server";
import { credentialsSchema } from "@/lib/auth/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { consumeAuthAttempt, resetAuthAttempts } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
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

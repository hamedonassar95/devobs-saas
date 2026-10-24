import { NextResponse } from "next/server";
import { registrationSchema } from "@/lib/auth/schemas";
import { consumeAuthAttempt } from "@/lib/auth/rate-limit";
import { createEmailVerificationToken, sendVerificationEmail } from "@/lib/auth/email-verification";
import { prisma } from "@/lib/db";
import { readBoundedJson } from "@/lib/http/bounded-json";

const NO_STORE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const GENERIC_ACCEPTED_RESPONSE = { ok: true };

function acceptedResponse(): NextResponse {
  return NextResponse.json(GENERIC_ACCEPTED_RESPONSE, { status: 202, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 16 * 1024);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The registration request is too large." }, { status: 413, headers: NO_STORE_HEADERS });
  }
  const parsed = registrationSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json({ error: "Invalid registration details." }, { status: 400, headers: NO_STORE_HEADERS });

  const email = parsed.data.email.trim().toLowerCase();
  const registerLimit = await consumeAuthAttempt("register", email);
  if (!registerLimit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(registerLimit.retryAfterSeconds) } },
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) return acceptedResponse();

  const emailLimit = await consumeAuthAttempt("emailVerification", email);
  const globalEmailLimit = emailLimit.allowed
    ? await consumeAuthAttempt("emailVerificationGlobal", "all-email-verification-sends")
    : emailLimit;
  if (!emailLimit.allowed || !globalEmailLimit.allowed) return acceptedResponse();

  const verification = createEmailVerificationToken();
  await prisma.pendingRegistration.upsert({
    where: { email },
    create: {
      email,
      name: parsed.data.name,
      organizationName: parsed.data.organizationName,
      tokenHash: verification.tokenHash,
      expiresAt: verification.expiresAt,
    },
    update: {
      name: parsed.data.name,
      organizationName: parsed.data.organizationName,
      tokenHash: verification.tokenHash,
      expiresAt: verification.expiresAt,
    },
  });

  if (!(await sendVerificationEmail(email, verification.token))) {
    console.error("[auth] Verification email delivery failed.");
  }

  return acceptedResponse();
}

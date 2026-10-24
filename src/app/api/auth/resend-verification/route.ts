import { NextResponse } from "next/server";
import { consumeAuthAttempt } from "@/lib/auth/rate-limit";
import { createEmailVerificationToken, sendVerificationEmail } from "@/lib/auth/email-verification";
import { resendEmailVerificationSchema } from "@/lib/auth/schemas";
import { prisma } from "@/lib/db";
import { readBoundedJson } from "@/lib/http/bounded-json";

const NO_STORE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const GENERIC_ACCEPTED_RESPONSE = { ok: true };

function acceptedResponse(): NextResponse {
  return NextResponse.json(GENERIC_ACCEPTED_RESPONSE, { status: 202, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 4 * 1024);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The verification request is too large." }, { status: 413, headers: NO_STORE_HEADERS });
  }
  const parsed = resendEmailVerificationSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers: NO_STORE_HEADERS });

  const email = parsed.data.email.trim().toLowerCase();
  const emailLimit = await consumeAuthAttempt("emailVerification", email);
  if (!emailLimit.allowed) return acceptedResponse();

  const now = new Date();
  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (!pending) return acceptedResponse();
  if (pending.expiresAt.getTime() <= now.getTime()) {
    await prisma.pendingRegistration.deleteMany({ where: { id: pending.id, expiresAt: { lte: now } } });
    return acceptedResponse();
  }

  const globalLimit = await consumeAuthAttempt("emailVerificationGlobal", "all-email-verification-sends");
  if (!globalLimit.allowed) return acceptedResponse();

  const verification = createEmailVerificationToken(now);
  const updated = await prisma.pendingRegistration.updateMany({
    where: { id: pending.id, tokenHash: pending.tokenHash, expiresAt: { gt: now } },
    data: { tokenHash: verification.tokenHash, expiresAt: verification.expiresAt },
  });
  if (updated.count !== 1) return acceptedResponse();

  if (!(await sendVerificationEmail(email, verification.token))) {
    console.error("[auth] Verification email delivery failed.");
  }
  return acceptedResponse();
}

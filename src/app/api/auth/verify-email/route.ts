import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { consumeAuthAttempt } from "@/lib/auth/rate-limit";
import { hashEmailVerificationToken } from "@/lib/auth/email-verification";
import { emailVerificationSchema } from "@/lib/auth/schemas";
import { createOrganizationSlug } from "@/lib/organizations/slug";
import { prisma } from "@/lib/db";
import { readBoundedJson } from "@/lib/http/bounded-json";

const NO_STORE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const INVALID_LINK = { error: "This verification link is invalid or expired." };

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 8 * 1024);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The verification request is too large." }, { status: 413, headers: NO_STORE_HEADERS });
  }
  const parsed = emailVerificationSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json(INVALID_LINK, { status: 400, headers: NO_STORE_HEADERS });

  const tokenHash = hashEmailVerificationToken(parsed.data.token);
  const limit = await consumeAuthAttempt("emailVerificationConfirm", tokenHash);
  if (!limit.allowed) {
    return NextResponse.json(INVALID_LINK, {
      status: 429,
      headers: { ...NO_STORE_HEADERS, "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const now = new Date();
  const pending = await prisma.pendingRegistration.findUnique({ where: { tokenHash } });
  if (!pending) return NextResponse.json(INVALID_LINK, { status: 400, headers: NO_STORE_HEADERS });
  if (pending.expiresAt.getTime() <= now.getTime()) {
    await prisma.pendingRegistration.deleteMany({ where: { id: pending.id, expiresAt: { lte: now } } });
    return NextResponse.json(INVALID_LINK, { status: 400, headers: NO_STORE_HEADERS });
  }
  const passwordHash = await hashPassword(parsed.data.password);

  let userId: string | null;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const current = await tx.pendingRegistration.findUnique({ where: { id: pending.id } });
      if (!current || current.tokenHash !== tokenHash || current.expiresAt.getTime() <= Date.now()) return null;

      const createdUser = await tx.user.create({
        data: {
          email: current.email,
          name: current.name,
          passwordHash,
          emailVerifiedAt: new Date(),
          emailVerificationRequired: true,
        },
        select: { id: true },
      });
      const organization = await tx.organization.create({
        data: { name: current.organizationName, slug: createOrganizationSlug(current.organizationName) },
        select: { id: true },
      });
      await tx.membership.create({
        data: { userId: createdUser.id, organizationId: organization.id, role: "OWNER", status: "ACTIVE" },
      });
      await tx.pendingRegistration.delete({ where: { id: current.id } });
      return createdUser.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(INVALID_LINK, { status: 400, headers: NO_STORE_HEADERS });
    }
    throw error;
  }

  if (!userId) return NextResponse.json(INVALID_LINK, { status: 400, headers: NO_STORE_HEADERS });
  await createSession(userId);
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

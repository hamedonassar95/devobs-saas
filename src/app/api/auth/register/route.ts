import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { registrationSchema } from "@/lib/auth/schemas";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { consumeAuthAttempt, resetAuthAttempts } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { readBoundedJson } from "@/lib/http/bounded-json";

function createSlug(name: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "team";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 16 * 1024);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The registration request is too large." }, { status: 413 });
  }
  const parsed = registrationSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json({ error: "Invalid registration details." }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const limit = await consumeAuthAttempt("register", email);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email, name: parsed.data.name, passwordHash },
        select: { id: true },
      });
      const organization = await tx.organization.create({
        data: { name: parsed.data.organizationName, slug: createSlug(parsed.data.organizationName) },
        select: { id: true },
      });
      await tx.membership.create({
        data: { userId: createdUser.id, organizationId: organization.id, role: "OWNER", status: "ACTIVE" },
      });
      return createdUser;
    });
    await resetAuthAttempts("register", email);
    await createSession(user.id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    throw error;
  }
}

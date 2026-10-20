import { NextResponse } from "next/server";
import { credentialsSchema } from "@/lib/auth/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.trim().toLowerCase() } });
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}

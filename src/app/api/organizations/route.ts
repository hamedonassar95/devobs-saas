import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ organizations: memberships.map(({ role, organization }) => ({ ...organization, role })) });
}

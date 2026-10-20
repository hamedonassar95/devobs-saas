import { MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export class BillingAuthorizationError extends Error {
  constructor() {
    super("Only an active organization owner can manage billing.");
    this.name = "BillingAuthorizationError";
  }
}

export async function requireBillingOwner(userId: string | null, organizationId: string): Promise<string> {
  if (!userId) throw new BillingAuthorizationError();
  const membership = await prisma.membership.findFirst({
    where: { userId, organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });
  if (!membership) throw new BillingAuthorizationError();
  return userId;
}

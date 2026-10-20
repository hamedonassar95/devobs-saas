import { MembershipStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

export class TenantAccessError extends Error {
  constructor() {
    super("Organization not found");
    this.name = "TenantAccessError";
  }
}

export type TenantContext = Readonly<{
  userId: string;
  organizationId: string;
}>;

export async function requireTenantContext(
  userId: string | null,
  organizationId: string,
  client: PrismaClient = prisma,
): Promise<TenantContext> {
  if (!userId || !organizationId) throw new TenantAccessError();
  const membership = await client.membership.findFirst({
    where: { userId, organizationId, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });
  if (!membership) throw new TenantAccessError();
  return { userId, organizationId };
}

export async function withTenantTransaction<T>(
  tenant: TenantContext,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  client: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${tenant.organizationId}, true)`;
    return operation(tx);
  });
}

export function tenantWhere<T extends Record<string, unknown>>(
  organizationId: string,
  where: T = {} as T,
): T & { organizationId: string } {
  return { ...where, organizationId };
}

export function tenantCreateData<T extends Record<string, unknown>>(
  organizationId: string,
  input: T,
): Omit<T, "organizationId"> & { organizationId: string } {
  const { organizationId: _untrustedOrganizationId, ...safeInput } = input;
  void _untrustedOrganizationId;
  return { ...safeInput, organizationId } as Omit<T, "organizationId"> & { organizationId: string };
}

export function tenantUpdateData<T extends Record<string, unknown>>(input: T): Omit<T, "organizationId" | "id"> {
  const { organizationId: _organizationId, id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...safeInput } = input;
  void _organizationId;
  void _id;
  void _createdAt;
  void _updatedAt;
  return safeInput as Omit<T, "organizationId" | "id">;
}

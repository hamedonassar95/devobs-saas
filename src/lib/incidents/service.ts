import { IncidentStatus, Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/access";
import type { CreateIncidentInput } from "./input";

const incidentInclude = {
  createdBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
  alertLinks: {
    orderBy: { linkedAt: "asc" as const },
    take: 25,
    include: {
      linkedBy: { select: { id: true, name: true } },
      alert: {
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          openedAt: true,
          externalId: true,
          source: { select: { id: true, name: true, provider: true } },
        },
      },
    },
  },
} satisfies Prisma.IncidentInclude;

export class IncidentAlertsNotFoundError extends Error {
  constructor() {
    super("One or more selected alerts were not found.");
    this.name = "IncidentAlertsNotFoundError";
  }
}

export async function listIncidents(
  tx: Prisma.TransactionClient,
  tenant: TenantContext,
  page: { take: number; cursor?: string },
) {
  const visibleCursor = page.cursor
    ? await tx.incident.findFirst({
      where: { organizationId: tenant.organizationId, id: page.cursor },
      select: { id: true },
    })
    : null;
  if (page.cursor && !visibleCursor) return [];

  return tx.incident.findMany({
    where: { organizationId: tenant.organizationId },
    orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    take: page.take,
    ...(visibleCursor ? {
      cursor: { organizationId_id: { organizationId: tenant.organizationId, id: visibleCursor.id } },
      skip: 1,
    } : {}),
    include: incidentInclude,
  });
}

export async function getIncident(tx: Prisma.TransactionClient, tenant: TenantContext, id: string) {
  return tx.incident.findFirst({ where: { id, organizationId: tenant.organizationId }, include: incidentInclude });
}

export async function createIncident(
  tx: Prisma.TransactionClient,
  tenant: TenantContext,
  input: CreateIncidentInput,
) {
  const alertIds = input.alerts.map(({ alertId }) => alertId);
  const visibleAlerts = await tx.alert.findMany({
    where: { organizationId: tenant.organizationId, id: { in: alertIds } },
    select: { id: true },
  });
  if (visibleAlerts.length !== alertIds.length) throw new IncidentAlertsNotFoundError();

  const incident = await tx.incident.create({
    data: {
      organizationId: tenant.organizationId,
      title: input.title,
      description: input.description || null,
      createdByUserId: tenant.userId,
    },
  });
  await tx.incidentAlert.createMany({
    data: input.alerts.map(({ alertId, reason }) => ({
      organizationId: tenant.organizationId,
      incidentId: incident.id,
      alertId,
      linkedByUserId: tenant.userId,
      linkReason: reason,
    })),
  });
  return getIncident(tx, tenant, incident.id);
}

export async function setIncidentStatus(
  tx: Prisma.TransactionClient,
  tenant: TenantContext,
  id: string,
  status: IncidentStatus,
) {
  const current = await tx.incident.findFirst({
    where: { id, organizationId: tenant.organizationId },
    select: { id: true, status: true },
  });
  if (!current) return null;
  if (current.status === status) return getIncident(tx, tenant, id);

  const resolved = status === IncidentStatus.RESOLVED;
  const result = await tx.incident.updateMany({
    where: { id, organizationId: tenant.organizationId },
    data: {
      status,
      resolvedAt: resolved ? new Date() : null,
      resolvedByUserId: resolved ? tenant.userId : null,
    },
  });
  return result.count ? getIncident(tx, tenant, id) : null;
}

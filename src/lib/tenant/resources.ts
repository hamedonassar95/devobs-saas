import { Prisma } from "@prisma/client";
import type { TenantContext } from "./access";
import { tenantCreateData, tenantUpdateData, tenantWhere } from "./access";
import { createMonitoringWebhookToken, hashMonitoringWebhookToken } from "@/lib/monitoring/webhook-token";

export const TENANT_RESOURCES = ["integrations", "monitoring-sources", "alerts", "analysis-results"] as const;
export type TenantResourceName = (typeof TENANT_RESOURCES)[number];

export function isTenantResource(value: string): value is TenantResourceName {
  return TENANT_RESOURCES.includes(value as TenantResourceName);
}

export async function listTenantResource(
  client: Prisma.TransactionClient,
  tenant: TenantContext,
  resource: TenantResourceName,
  page: { take: number; cursor?: string } = { take: 100 },
) {
  const pagination = {
    take: page.take,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  };
  switch (resource) {
    case "integrations":
      return client.ciCdIntegration.findMany({ where: tenantWhere(tenant.organizationId) as Prisma.CiCdIntegrationWhereInput, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...pagination });
    case "monitoring-sources":
      return client.monitoringSource.findMany({ where: tenantWhere(tenant.organizationId) as Prisma.MonitoringSourceWhereInput, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...pagination });
    case "alerts":
      return client.alert.findMany({ where: tenantWhere(tenant.organizationId) as Prisma.AlertWhereInput, orderBy: [{ openedAt: "desc" }, { id: "desc" }], ...pagination });
    case "analysis-results":
      return client.analysisResult.findMany({ where: tenantWhere(tenant.organizationId) as Prisma.AnalysisResultWhereInput, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...pagination });
  }
}

export async function getTenantResource(client: Prisma.TransactionClient, tenant: TenantContext, resource: TenantResourceName, id: string) {
  switch (resource) {
    case "integrations":
      return client.ciCdIntegration.findFirst({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.CiCdIntegrationWhereInput });
    case "monitoring-sources":
      return client.monitoringSource.findFirst({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.MonitoringSourceWhereInput });
    case "alerts":
      return client.alert.findFirst({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.AlertWhereInput });
    case "analysis-results":
      return client.analysisResult.findFirst({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.AnalysisResultWhereInput });
  }
}

export async function createTenantResource(client: Prisma.TransactionClient, tenant: TenantContext, resource: TenantResourceName, input: Record<string, unknown>) {
  switch (resource) {
    case "integrations":
      return client.ciCdIntegration.create({ data: tenantCreateData(tenant.organizationId, input) as Prisma.CiCdIntegrationUncheckedCreateInput });
    case "monitoring-sources":
      return client.monitoringSource.create({ data: tenantCreateData(tenant.organizationId, input) as Prisma.MonitoringSourceUncheckedCreateInput });
    case "alerts":
      return client.alert.create({ data: tenantCreateData(tenant.organizationId, input) as Prisma.AlertUncheckedCreateInput });
    case "analysis-results":
      return client.analysisResult.create({ data: tenantCreateData(tenant.organizationId, input) as Prisma.AnalysisResultUncheckedCreateInput });
  }
}

export async function createTenantMonitoringSource(client: Prisma.TransactionClient, tenant: TenantContext, input: Record<string, unknown>) {
  const webhookToken = createMonitoringWebhookToken();
  const item = await client.monitoringSource.create({
    data: tenantCreateData(tenant.organizationId, input) as Prisma.MonitoringSourceUncheckedCreateInput,
  });
  await client.monitoringWebhookCredential.create({
    data: {
      organizationId: tenant.organizationId,
      sourceId: item.id,
      tokenHash: hashMonitoringWebhookToken(webhookToken),
    },
  });
  return { item, webhookToken };
}

export async function updateTenantResource(client: Prisma.TransactionClient, tenant: TenantContext, resource: TenantResourceName, id: string, input: Record<string, unknown>) {
  const data = tenantUpdateData(input);
  switch (resource) {
    case "integrations":
      return client.ciCdIntegration.updateMany({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.CiCdIntegrationWhereInput, data: data as Prisma.CiCdIntegrationUpdateManyMutationInput });
    case "monitoring-sources":
      return client.monitoringSource.updateMany({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.MonitoringSourceWhereInput, data: data as Prisma.MonitoringSourceUpdateManyMutationInput });
    case "alerts":
      return client.alert.updateMany({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.AlertWhereInput, data: data as Prisma.AlertUpdateManyMutationInput });
    case "analysis-results":
      return client.analysisResult.updateMany({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.AnalysisResultWhereInput, data: data as Prisma.AnalysisResultUpdateManyMutationInput });
  }
}

export async function deleteTenantResource(client: Prisma.TransactionClient, tenant: TenantContext, resource: TenantResourceName, id: string) {
  switch (resource) {
    case "integrations":
      return client.ciCdIntegration.deleteMany({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.CiCdIntegrationWhereInput });
    case "monitoring-sources":
      return client.monitoringSource.deleteMany({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.MonitoringSourceWhereInput });
    case "alerts":
      return client.alert.deleteMany({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.AlertWhereInput });
    case "analysis-results":
      return client.analysisResult.deleteMany({ where: tenantWhere(tenant.organizationId, { id }) as Prisma.AnalysisResultWhereInput });
  }
}

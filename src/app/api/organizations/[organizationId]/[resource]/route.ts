import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { requireTenantContext, requireTenantContextForPermission, TenantAccessError, TenantPermissionError, withTenantTransaction, type TenantPermission } from "@/lib/tenant/access";
import { createTenantMonitoringSource, createTenantResource, isTenantResource, listTenantResource } from "@/lib/tenant/resources";
import { tenantResourceSchemas } from "@/lib/tenant/resource-schemas";

type RouteContext = { params: Promise<{ organizationId: string; resource: string }> };

async function getTenant(organizationId: string, permission: TenantPermission = "read") {
  const userId = await getAuthenticatedUserId();
  return permission === "read"
    ? requireTenantContext(userId, organizationId)
    : requireTenantContextForPermission(userId, organizationId, permission);
}

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId, resource } = await context.params;
  if (!isTenantResource(resource)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const tenant = await getTenant(organizationId);
    const items = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource(resource));
      return listTenantResource(tx, tenant, resource);
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId, resource } = await context.params;
  if (!isTenantResource(resource)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = tenantResourceSchemas[resource].safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid resource data." }, { status: 400 });
  try {
    const tenant = await getTenant(organizationId, "write");
    const created = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource(resource));
      if (resource === "monitoring-sources") {
        return { kind: "monitoring-source" as const, ...(await createTenantMonitoringSource(tx, tenant, parsed.data)) };
      }
      return { kind: "resource" as const, item: await createTenantResource(tx, tenant, resource, parsed.data) };
    });
    if (created.kind === "monitoring-source") {
      const webhookPath = `/api/webhooks/monitoring/${encodeURIComponent(organizationId)}/${encodeURIComponent(created.item.id)}`;
      return NextResponse.json({ item: created.item, webhookPath, webhookToken: created.webhookToken }, { status: 201 });
    }
    return NextResponse.json({ item: created.item }, { status: 201 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

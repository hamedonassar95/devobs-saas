import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { requireTenantContext, requireTenantContextForPermission, TenantAccessError, TenantPermissionError, withTenantTransaction, type TenantPermission } from "@/lib/tenant/access";
import { createTenantResource, isTenantResource, listTenantResource } from "@/lib/tenant/resources";
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
    const item = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource(resource));
      return createTenantResource(tx, tenant, resource, parsed.data);
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

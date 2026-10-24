import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { requireTenantContext, requireTenantContextForPermission, TenantAccessError, TenantPermissionError, withTenantTransaction } from "@/lib/tenant/access";
import { deleteTenantResource, getTenantResource, isTenantResource, updateTenantResource } from "@/lib/tenant/resources";
import { tenantResourceSchemas } from "@/lib/tenant/resource-schemas";
import { readBoundedJson } from "@/lib/http/bounded-json";

type RouteContext = { params: Promise<{ organizationId: string; resource: string; id: string }> };

function partialResourceSchema(resource: keyof typeof tenantResourceSchemas) {
  return tenantResourceSchemas[resource].partial();
}

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId, resource, id } = await context.params;
  if (!isTenantResource(resource)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const tenant = await requireTenantContext(await getAuthenticatedUserId(), organizationId);
    const item = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource(resource));
      return getTenantResource(tx, tenant, resource, id);
    });
    return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { organizationId, resource, id } = await context.params;
  if (!isTenantResource(resource)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await readBoundedJson(request, 32 * 1024);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The resource request is too large." }, { status: 413 });
  }
  const parsed = partialResourceSchema(resource).safeParse(body?.data ?? null);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return NextResponse.json({ error: "Invalid resource data." }, { status: 400 });
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "write");
    const result = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource(resource));
      return updateTenantResource(tx, tenant, resource, id, parsed.data as Record<string, unknown>);
    });
    return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { organizationId, resource, id } = await context.params;
  if (!isTenantResource(resource)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "delete");
    const result = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource(resource));
      return deleteTenantResource(tx, tenant, resource, id);
    });
    return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}

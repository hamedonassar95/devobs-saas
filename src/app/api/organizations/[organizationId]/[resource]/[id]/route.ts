import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { requireTenantContext, TenantAccessError, withTenantTransaction } from "@/lib/tenant/access";
import { deleteTenantResource, getTenantResource, isTenantResource, updateTenantResource } from "@/lib/tenant/resources";
import { tenantResourceSchemas } from "@/lib/tenant/resource-schemas";

type RouteContext = { params: Promise<{ organizationId: string; resource: string; id: string }> };

function partialResourceSchema(resource: keyof typeof tenantResourceSchemas) {
  return tenantResourceSchemas[resource].partial();
}

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId, resource, id } = await context.params;
  if (!isTenantResource(resource)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const tenant = await requireTenantContext(await getAuthenticatedUserId(), organizationId);
    const item = await withTenantTransaction(tenant, (tx) => getTenantResource(tx, tenant, resource, id));
    return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { organizationId, resource, id } = await context.params;
  if (!isTenantResource(resource)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = partialResourceSchema(resource).safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return NextResponse.json({ error: "Invalid resource data." }, { status: 400 });
  try {
    const tenant = await requireTenantContext(await getAuthenticatedUserId(), organizationId);
    const result = await withTenantTransaction(tenant, (tx) => updateTenantResource(tx, tenant, resource, id, parsed.data as Record<string, unknown>));
    return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { organizationId, resource, id } = await context.params;
  if (!isTenantResource(resource)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const tenant = await requireTenantContext(await getAuthenticatedUserId(), organizationId);
    const result = await withTenantTransaction(tenant, (tx) => deleteTenantResource(tx, tenant, resource, id));
    return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

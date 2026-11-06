import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { readBoundedJson } from "@/lib/http/bounded-json";
import { createIncidentSchema } from "@/lib/incidents/input";
import { createIncident, IncidentAlertsNotFoundError, listIncidents } from "@/lib/incidents/service";
import { requireTenantContext, requireTenantContextForPermission, TenantAccessError, TenantPermissionError, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string }> };
const PAGE_SIZE = 25;

function handleError(error: unknown) {
  if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
  if (error instanceof IncidentAlertsNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  throw error;
}

export async function GET(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  if (cursor !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(cursor)) {
    return NextResponse.json({ error: "Invalid incident cursor." }, { status: 400 });
  }
  try {
    const tenant = await requireTenantContext(await getAuthenticatedUserId(), organizationId);
    const records = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, "monitoring");
      return listIncidents(tx, tenant, { take: PAGE_SIZE + 1, ...(cursor ? { cursor } : {}) });
    });
    const hasMore = records.length > PAGE_SIZE;
    const items = hasMore ? records.slice(0, PAGE_SIZE) : records;
    return NextResponse.json({ items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  const body = await readBoundedJson(request, 64 * 1024);
  if (body && "tooLarge" in body) return NextResponse.json({ error: "The incident request is too large." }, { status: 413 });
  const parsed = createIncidentSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json({ error: "Invalid incident data." }, { status: 400 });

  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "write");
    const incident = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, "monitoring");
      return createIncident(tx, tenant, parsed.data);
    });
    if (!incident) return NextResponse.json({ error: "Incident could not be created." }, { status: 500 });
    return NextResponse.json({ item: incident }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

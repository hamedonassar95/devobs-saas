import { IncidentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { readBoundedJson } from "@/lib/http/bounded-json";
import { incidentStatusSchema } from "@/lib/incidents/input";
import { getIncident, setIncidentStatus } from "@/lib/incidents/service";
import { requireTenantContext, requireTenantContextForPermission, TenantAccessError, TenantPermissionError, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string; incidentId: string }> };

function handleError(error: unknown) {
  if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
  throw error;
}

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId, incidentId } = await context.params;
  try {
    const tenant = await requireTenantContext(await getAuthenticatedUserId(), organizationId);
    const incident = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, "monitoring");
      return getIncident(tx, tenant, incidentId);
    });
    return incident
      ? NextResponse.json({ item: incident }, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: "Incident not found." }, { status: 404 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { organizationId, incidentId } = await context.params;
  const body = await readBoundedJson(request, 2 * 1024);
  if (body && "tooLarge" in body) return NextResponse.json({ error: "The incident request is too large." }, { status: 413 });
  const parsed = incidentStatusSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json({ error: "Invalid incident status." }, { status: 400 });

  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "write");
    const incident = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, "monitoring");
      return setIncidentStatus(tx, tenant, incidentId, parsed.data.status as IncidentStatus);
    });
    return incident
      ? NextResponse.json({ item: incident }, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: "Incident not found." }, { status: 404 });
  } catch (error) {
    return handleError(error);
  }
}

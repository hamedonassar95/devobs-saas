import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { BillingAuthorizationError, requireBillingOwner } from "@/lib/billing/authorization";
import { requireTenantContext, withTenantTransaction } from "@/lib/tenant/access";
import { getAppUrl, getStripe } from "@/lib/stripe/client";
import { readBoundedJson } from "@/lib/http/bounded-json";

const portalSchema = z.object({ organizationId: z.string().min(1) });

export async function POST(request: Request) {
  const body = await readBoundedJson(request, 4 * 1024);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The billing request is too large." }, { status: 413 });
  }
  const parsed = portalSchema.safeParse(body?.data ?? null);
  if (!parsed.success) return NextResponse.json({ error: "Invalid billing request." }, { status: 400 });
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  try {
    await requireBillingOwner(userId, parsed.data.organizationId);
    const tenant = await requireTenantContext(userId, parsed.data.organizationId);
    const organization = await withTenantTransaction(tenant, (tx) => tx.organization.findUnique({
      where: { id: tenant.organizationId }, select: { stripeCustomerId: true },
    }));
    if (!organization?.stripeCustomerId) return NextResponse.json({ error: "Choose a subscription before opening billing management." }, { status: 409 });
    const session = await getStripe().billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: `${getAppUrl()}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof BillingAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && /Stripe is not configured|APP_URL is not configured|APP_URL must/.test(error.message)) {
      return NextResponse.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
    }
    throw error;
  }
}

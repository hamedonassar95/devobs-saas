import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { BillingAuthorizationError, requireBillingOwner } from "@/lib/billing/authorization";
import { requireTenantContext, withTenantTransaction } from "@/lib/tenant/access";
import { getAppUrl, getStripe } from "@/lib/stripe/client";

const portalSchema = z.object({ organizationId: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = portalSchema.safeParse(await request.json().catch(() => null));
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { BillingAuthorizationError, requireBillingOwner } from "@/lib/billing/authorization";
import { requireTenantContext, withTenantTransaction } from "@/lib/tenant/access";
import { getAppUrl, getStripe } from "@/lib/stripe/client";
import { stripePriceId } from "@/lib/billing/plans";

const checkoutSchema = z.object({
  organizationId: z.string().min(1),
  plan: z.enum(SubscriptionPlan),
});

export async function POST(request: Request) {
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const priceId = stripePriceId(parsed.data.plan);
  if (!priceId) return NextResponse.json({ error: "This plan is not configured in Stripe yet." }, { status: 503 });

  try {
    await requireBillingOwner(userId, parsed.data.organizationId);
    const tenant = await requireTenantContext(userId, parsed.data.organizationId);
    const account = await withTenantTransaction(tenant, async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: tenant.organizationId },
        select: { id: true, name: true, stripeCustomerId: true },
      });
      if (!organization) return null;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
      const current = await tx.subscription.findFirst({
        where: { organizationId: tenant.organizationId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
        select: { id: true },
      });
      const trialUsed = Boolean(await tx.subscription.findFirst({
        where: { organizationId: tenant.organizationId, trialStartedAt: { not: null } },
        select: { id: true },
      }));
      return { organization, email: user?.email, hasCurrentSubscription: Boolean(current), trialUsed };
    });
    if (!account) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    if (account.hasCurrentSubscription) {
      return NextResponse.json({ error: "This organization already has an active subscription. Use the billing portal to manage it." }, { status: 409 });
    }

    const stripe = getStripe();
    const appUrl = getAppUrl();
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.type !== "recurring" || price.recurring?.interval !== "month") {
      return NextResponse.json({ error: "The configured Stripe Price must be active and billed monthly." }, { status: 503 });
    }
    let customerId = account.organization.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { metadata: { organizationId: account.organization.id } },
        { idempotencyKey: `devobs_customer_${account.organization.id}` },
      );
      customerId = customer.id;
      await withTenantTransaction(tenant, async (tx) => {
        await tx.organization.updateMany({
          where: { id: tenant.organizationId, stripeCustomerId: null },
          data: { stripeCustomerId: customerId },
        });
      });
      const linkedCustomer = await withTenantTransaction(tenant, (tx) => tx.organization.findUnique({
        where: { id: tenant.organizationId }, select: { stripeCustomerId: true },
      }));
      if (linkedCustomer?.stripeCustomerId !== customerId) {
        return NextResponse.json({ error: "Could not securely link the Stripe customer." }, { status: 409 });
      }
    }
    if (account.email) await stripe.customers.update(customerId, { email: account.email });
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(account.trialUsed ? {} : { trial_period_days: 14 }),
        metadata: { organizationId: account.organization.id, plan: parsed.data.plan },
      },
      metadata: { organizationId: account.organization.id, plan: parsed.data.plan },
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancelled`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    if (error instanceof BillingAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && /Stripe is not configured|APP_URL is not configured|APP_URL must/.test(error.message)) {
      return NextResponse.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
    }
    throw error;
  }
}

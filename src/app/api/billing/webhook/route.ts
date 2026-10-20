import { NextResponse } from "next/server";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";
import { isSubscriptionPlan, isSubscriptionStatus } from "@/lib/billing/entitlements";
import { planForStripePrice } from "@/lib/billing/plans";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe/client";
import { applyStripeSubscriptionSnapshot } from "@/lib/billing/stripe-events";

function dateFromUnix(value: number | null): Date | null {
  return value === null ? null : new Date(value * 1000);
}

async function syncSubscriptionEvent(event: Stripe.Event, subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const organizationId = subscription.metadata.organizationId ?? (
    await prisma.organization.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } })
  )?.id;
  if (!organizationId) throw new Error("No organization is linked to the Stripe subscription.");

  const metadataPlan = subscription.metadata.plan;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = (priceId ? planForStripePrice(priceId) : null) ?? (metadataPlan && isSubscriptionPlan(metadataPlan) ? metadataPlan : null);
  if (!plan) throw new Error("No configured plan is linked to the Stripe subscription.");

  const status = subscription.status.toUpperCase();
  if (!isSubscriptionStatus(status)) throw new Error("Stripe returned an unsupported subscription status.");
  const currentPeriodEnd = subscription.items.data.reduce<number | null>((latest, item) => {
    return latest === null || item.current_period_end > latest ? item.current_period_end : latest;
  }, null);

  await applyStripeSubscriptionSnapshot({
    eventId: event.id,
    eventType: event.type,
    eventCreatedAt: event.created,
    organizationId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    plan: plan as SubscriptionPlan,
    status: status as SubscriptionStatus,
    trialStartedAt: dateFromUnix(subscription.trial_start),
    trialEndsAt: dateFromUnix(subscription.trial_end),
    currentPeriodEnd: dateFromUnix(currentPeriodEnd),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }
  const payload = await request.text();
  if (payload.length > 1_000_000) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    if ([
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "customer.subscription.paused",
      "customer.subscription.resumed",
    ].includes(event.type)) {
      await syncSubscriptionEvent(event, event.data.object as Stripe.Subscription);
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        await syncSubscriptionEvent(event, subscription);
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Could not apply the Stripe event." }, { status: 500 });
  }
}

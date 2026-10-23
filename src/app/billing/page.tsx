import Link from "next/link";
import { MembershipStatus } from "@prisma/client";
import BillingControls from "./billing-controls";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { PLAN_CATALOG } from "@/lib/billing/plans";
import { prisma } from "@/lib/db";
import { requireTenantContext, withTenantTransaction } from "@/lib/tenant/access";

type BillingPageProps = { searchParams: Promise<{ checkout?: string }> };

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return <main><h1>Billing</h1><p>Sign in to view organization billing.</p><Link href="/login">Sign in</Link></main>;
  }

  const memberships = await prisma.membership.findMany({
    where: { userId, status: MembershipStatus.ACTIVE },
    select: {
      role: true,
      organization: { select: { id: true, name: true, stripeCustomerId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const organizations = await Promise.all(memberships.map(async ({ role, organization }) => {
    const tenant = await requireTenantContext(userId, organization.id);
    const billing = await withTenantTransaction(tenant, async (tx) => {
      const [subscription, trial] = await Promise.all([
        tx.subscription.findFirst({
          where: { organizationId: organization.id },
          orderBy: { updatedAt: "desc" },
          select: { plan: true, status: true, trialEndsAt: true, currentPeriodEnd: true },
        }),
        tx.subscription.findFirst({ where: { organizationId: organization.id, trialStartedAt: { not: null } }, select: { id: true } }),
      ]);
      return { subscription, trialUsed: Boolean(trial) };
    });
    return {
      id: organization.id,
      name: organization.name,
      role,
      stripeCustomerLinked: Boolean(organization.stripeCustomerId),
      plan: billing.subscription?.plan ?? null,
      status: billing.subscription?.status ?? null,
      trialEndsAt: billing.subscription?.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: billing.subscription?.currentPeriodEnd?.toISOString() ?? null,
      trialUsed: billing.trialUsed,
    };
  }));
  const query = await searchParams;
  const message = query.checkout === "success"
    ? "Checkout completed or is processing. Subscription access appears after Stripe confirms it by webhook."
    : query.checkout === "cancelled" ? "Checkout was canceled; no subscription was activated." : null;

  return (
    <main>
      <h1>Billing</h1>
      <p>Monthly subscriptions for each organization.</p>
      <p><Link href="/dashboard/ai">Open AI incident analysis workspace</Link></p>
      <p><Link href="/dashboard/devobs">Open Devobs automation hub</Link></p>
      {message && <p role="status">{message}</p>}
      <ul>
        {Object.entries(PLAN_CATALOG).map(([key, plan]) => <li key={key}><strong>{plan.name}</strong>: {plan.description}</li>)}
      </ul>
      {organizations.length ? <BillingControls organizations={organizations} /> : <p>No active organizations found. <Link href="/register">Create an organization</Link></p>}
      <p><Link href="/">Back to home</Link></p>
    </main>
  );
}

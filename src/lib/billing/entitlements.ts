import { SubscriptionPlan, SubscriptionStatus, type Prisma } from "@prisma/client";
import { planIncludesFeature, type ProductFeature } from "@/lib/billing/plans";
import type { TenantResourceName } from "@/lib/tenant/resources";

export class PlanAccessError extends Error {
  constructor() {
    super("An active subscription with access to this feature is required.");
    this.name = "PlanAccessError";
  }
}

const RESOURCE_FEATURE: Record<TenantResourceName, ProductFeature> = {
  integrations: "cicd",
  "monitoring-sources": "monitoring",
  alerts: "monitoring",
  "analysis-results": "ai",
};

export function featureForResource(resource: TenantResourceName): ProductFeature {
  return RESOURCE_FEATURE[resource];
}

export async function requirePlanFeature(
  tx: Prisma.TransactionClient,
  organizationId: string,
  feature: ProductFeature,
): Promise<void> {
  const subscription = await tx.subscription.findFirst({
    where: {
      organizationId,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
    },
    orderBy: { updatedAt: "desc" },
    select: { plan: true },
  });
  if (!subscription || !planIncludesFeature(subscription.plan, feature)) throw new PlanAccessError();
}

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return Object.values(SubscriptionStatus).includes(value as SubscriptionStatus);
}

export function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return Object.values(SubscriptionPlan).includes(value as SubscriptionPlan);
}

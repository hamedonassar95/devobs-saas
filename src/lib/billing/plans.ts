export type ProductFeature = "monitoring" | "cicd" | "ai";
export const BILLING_PLANS = ["MONITORING", "CICD", "FULL"] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

export const PLAN_CATALOG: Record<BillingPlan, { name: string; description: string }> = {
  MONITORING: { name: "Monitoring only", description: "Monitoring sources and alerts." },
  CICD: { name: "CI/CD", description: "Connect and manage CI/CD integrations." },
  FULL: { name: "Full with AI", description: "Monitoring, CI/CD, and opt-in AI-assisted analysis." },
};

const PLAN_FEATURES: Record<BillingPlan, readonly ProductFeature[]> = {
  MONITORING: ["monitoring"],
  CICD: ["cicd"],
  FULL: ["monitoring", "cicd", "ai"],
};

export function planIncludesFeature(plan: BillingPlan, feature: ProductFeature): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

export function stripePriceId(plan: BillingPlan): string | null {
  const key: Record<BillingPlan, string> = {
    MONITORING: "STRIPE_PRICE_MONITORING",
    CICD: "STRIPE_PRICE_CICD",
    FULL: "STRIPE_PRICE_FULL",
  };
  return process.env[key[plan]]?.trim() || null;
}

export function planForStripePrice(priceId: string): BillingPlan | null {
  return BILLING_PLANS.find((plan) => stripePriceId(plan) === priceId) ?? null;
}

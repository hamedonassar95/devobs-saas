import { getStripe } from "@/lib/stripe/client";
import { stripePriceId, type BillingPlan } from "@/lib/billing/plans";

export type MarketingPrices = Partial<Record<BillingPlan, { label: string }>>;

const plans: BillingPlan[] = ["MONITORING", "CICD", "FULL"];

export async function getMarketingPrices(): Promise<MarketingPrices> {
  if (!process.env.STRIPE_SECRET_KEY) return {};

  const stripe = getStripe();
  const pairs = await Promise.all(
    plans.map(async (plan) => {
      const priceId = stripePriceId(plan);
      if (!priceId) return [plan, null] as const;

      try {
        const price = await stripe.prices.retrieve(priceId);
        if (price.recurring?.interval !== "month" || price.unit_amount === null)
          return [plan, null] as const;

        const formatter = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: price.currency.toUpperCase(),
        });
        const exponent = formatter.resolvedOptions().maximumFractionDigits ?? 2;
        return [
          plan,
          { label: formatter.format(price.unit_amount / 10 ** exponent) },
        ] as const;
      } catch {
        return [plan, null] as const;
      }
    }),
  );

  const result: MarketingPrices = {};
  for (const [plan, price] of pairs) {
    if (price) result[plan] = price;
  }
  return result;
}

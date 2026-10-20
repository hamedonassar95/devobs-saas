import Stripe from "stripe";

let stripe: Stripe | undefined;

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe is not configured.");
  stripe ??= new Stripe(secretKey);
  return stripe;
}

export function getAppUrl(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not configured.");
  const parsed = new URL(appUrl);
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production.");
  }
  return parsed.origin;
}

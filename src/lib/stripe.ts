import Stripe from "stripe";

// Server-only. TEST mode keys only for the demo.
export function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export const IDV_COOKIE = "idv_session";

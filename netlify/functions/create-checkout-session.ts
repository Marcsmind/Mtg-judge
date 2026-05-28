/**
 * Netlify function — Create a Stripe Checkout session.
 *
 * POST body: { priceType: 'pro_monthly' | 'pro_annual' | 'lifetime', userId: string, userEmail?: string }
 * Returns:   { url: string }  — redirect the browser to this URL
 *
 * Required env vars (Netlify → Site config → Environment):
 *   STRIPE_SECRET_KEY          — Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_PRICE_PRO_MONTHLY   — price_xxx ID for Pro Monthly ($4.99/mo)
 *   STRIPE_PRICE_PRO_ANNUAL    — price_xxx ID for Pro Annual ($34.99/yr)
 *   STRIPE_PRICE_LIFETIME      — price_xxx ID for Lifetime ($79.99 one-time)
 *   APP_URL                    — your production URL, e.g. https://yoursite.netlify.app
 *   VITE_SUPABASE_URL          — Supabase project URL (to look up existing customer ID)
 *   VITE_SUPABASE_ANON_KEY     — Supabase anon key
 */

import type { Handler } from "@netlify/functions";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

type PriceType = "pro_monthly" | "pro_annual" | "lifetime";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Stripe not configured." }) };
  }

  let priceType: PriceType;
  let userId: string;
  let userEmail: string | undefined;

  try {
    const body = JSON.parse(event.body ?? "{}");
    priceType = body.priceType;
    userId    = body.userId;
    userEmail = body.userEmail;
    if (!priceType || !userId) throw new Error("Missing priceType or userId");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: `Bad request: ${err}` }) };
  }

  // Map priceType → Stripe price ID
  const priceIdMap: Record<PriceType, string | undefined> = {
    pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    pro_annual:  process.env.STRIPE_PRICE_PRO_ANNUAL,
    lifetime:    process.env.STRIPE_PRICE_LIFETIME,
  };
  const priceId = priceIdMap[priceType];
  if (!priceId) {
    return { statusCode: 500, body: JSON.stringify({ error: `Price ID for '${priceType}' not configured.` }) };
  }

  const stripe = new Stripe(stripeKey);

  // Look up existing Stripe customer ID to avoid creating duplicates
  let stripeCustomerId: string | undefined;
  const supabaseUrl  = process.env.VITE_SUPABASE_URL;
  const supabaseKey  = process.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data } = await sb
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();
    stripeCustomerId = data?.stripe_customer_id ?? undefined;
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  const isLifetime = priceType === "lifetime";

  const session = await stripe.checkout.sessions.create({
    mode: isLifetime ? "payment" : "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    ...(stripeCustomerId
      ? { customer: stripeCustomerId }
      : userEmail
        ? { customer_email: userEmail }
        : {}),
    metadata: { userId, priceType },
    success_url: `${appUrl}/?upgraded=true`,
    cancel_url:  `${appUrl}/?upgraded=false`,
    allow_promotion_codes: true,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: session.url }),
  };
};

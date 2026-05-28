/**
 * Netlify function — Stripe webhook handler.
 *
 * Listens for subscription lifecycle events and keeps Supabase profiles
 * in sync with the customer's current plan.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY          — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET      — Signing secret from Stripe → Webhooks (whsec_...)
 *   VITE_SUPABASE_URL          — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service-role key (bypasses RLS to update any profile)
 *
 * Events to enable in Stripe Dashboard → Webhooks:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 */

import type { Handler } from "@netlify/functions";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl   = process.env.VITE_SUPABASE_URL;
  const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    console.error("[stripe-webhook] Missing required env vars");
    return { statusCode: 500, body: "Server misconfiguration" };
  }

  const stripe = new Stripe(stripeKey);
  const supabase = createClient(supabaseUrl, serviceKey);

  // Verify the webhook signature
  let stripeEvent: Stripe.Event;
  try {
    const sig = event.headers["stripe-signature"] ?? "";
    stripeEvent = stripe.webhooks.constructEvent(event.body ?? "", sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return { statusCode: 400, body: `Webhook signature invalid: ${err}` };
  }

  // ── Event handlers ───────────────────────────────────────────────────────

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const userId    = session.metadata?.userId;
    const priceType = session.metadata?.priceType as string | undefined;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

    if (!userId) {
      console.error("[stripe-webhook] checkout.session.completed missing userId in metadata");
      return { statusCode: 400, body: "Missing userId" };
    }

    const tier = priceType === "lifetime" ? "lifetime" : "pro";

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        subscription_tier: tier,
        stripe_customer_id: customerId ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (error) console.error("[stripe-webhook] upsert failed:", error.message);
    else console.log(`[stripe-webhook] Set ${userId} → ${tier}`);
  }

  if (stripeEvent.type === "customer.subscription.updated") {
    const sub = stripeEvent.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    // Find the Supabase user by their Stripe customer ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (!profile) {
      // Customer not yet linked — ignore (will be set on checkout.session.completed)
      return { statusCode: 200, body: "ok" };
    }

    const isActive = sub.status === "active" || sub.status === "trialing";
    const tier = isActive ? "pro" : "free";

    await supabase
      .from("profiles")
      .update({ subscription_tier: tier, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    console.log(`[stripe-webhook] subscription.updated: ${profile.id} → ${tier} (${sub.status})`);
  }

  if (stripeEvent.type === "customer.subscription.deleted") {
    const sub = stripeEvent.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (profile) {
      await supabase
        .from("profiles")
        .update({ subscription_tier: "free", updated_at: new Date().toISOString() })
        .eq("id", profile.id);
      console.log(`[stripe-webhook] subscription.deleted: ${profile.id} → free`);
    }
  }

  return { statusCode: 200, body: "ok" };
};

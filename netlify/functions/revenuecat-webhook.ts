/**
 * RevenueCat webhook — fired when a purchase or subscription change occurs
 * on iOS/Android. Updates profiles.subscription_tier in Supabase.
 *
 * Setup in RevenueCat Dashboard:
 *   Project → Integrations → Webhooks → Add endpoint
 *   URL: https://[your-site].netlify.app/.netlify/functions/revenuecat-webhook
 *   Events: INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, CANCELLATION,
 *            EXPIRATION, BILLING_ISSUE, SUBSCRIBER_ALIAS
 *
 * Netlify env vars required:
 *   REVENUECAT_WEBHOOK_SECRET   — Authorization header secret from RC dashboard
 *   SUPABASE_URL                — from Supabase → Settings → API
 *   SUPABASE_SERVICE_ROLE_KEY   — from Supabase → Settings → API (bypasses RLS)
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const WEBHOOK_SECRET  = process.env.REVENUECAT_WEBHOOK_SECRET;
const SUPABASE_URL    = process.env.SUPABASE_URL!;
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// RevenueCat event types that should result in a tier update
const ACTIVE_EVENTS   = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION"]);
const INACTIVE_EVENTS = new Set(["CANCELLATION", "EXPIRATION", "BILLING_ISSUE"]);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  // Verify the shared secret header RevenueCat sends
  if (WEBHOOK_SECRET) {
    const auth = event.headers["authorization"] ?? event.headers["Authorization"];
    if (auth !== WEBHOOK_SECRET) {
      return { statusCode: 401, body: "Unauthorized" };
    }
  }

  let payload: RCWebhookEvent;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { event: rcEvent } = payload;
  if (!rcEvent) return { statusCode: 400, body: "Missing event" };

  const userId     = rcEvent.app_user_id;
  const eventType  = rcEvent.type;
  const productId  = rcEvent.product_id ?? "";

  if (!userId || !eventType) return { statusCode: 400, body: "Missing fields" };

  if (!ACTIVE_EVENTS.has(eventType) && !INACTIVE_EVENTS.has(eventType)) {
    // Unhandled event type — acknowledge but do nothing
    return { statusCode: 200, body: "OK" };
  }

  const tier = ACTIVE_EVENTS.has(eventType)
    ? (productId.includes("lifetime") ? "lifetime" : "pro")
    : "free";

  const { error } = await supabase
    .from("profiles")
    .update({ subscription_tier: tier })
    .eq("id", userId);

  if (error) {
    console.error("[revenuecat-webhook] Supabase update failed:", error.message);
    return { statusCode: 500, body: error.message };
  }

  return { statusCode: 200, body: "OK" };
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RCWebhookEvent {
  event?: {
    type: string;
    app_user_id: string;
    product_id?: string;
    period_type?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number;
  };
}

/**
 * Netlify serverless function — Gemini API proxy with per-IP daily quota.
 *
 * Environment variables (set in Netlify → Site configuration → Environment):
 *   GEMINI_API_KEY          — shared Gemini key (required)
 *   ACCESS_CODE             — optional passphrase gate AND quota bypass
 *   VITE_SUPABASE_URL       — Supabase project URL (for quota tracking)
 *   VITE_SUPABASE_ANON_KEY  — Supabase anon key (for quota tracking)
 *
 * Quota behaviour:
 *   - Free users (no access code): 5 questions/day per IP address
 *   - Requests that include the correct ACCESS_CODE bypass the quota entirely
 *     (use this for your own testing / admin access)
 *   - If Supabase is not configured, quota tracking is skipped (allow all)
 *
 * POST body: { model: string, payload: object, accessCode?: string }
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const DAILY_LIMIT = 5;

// ── Supabase client ──────────────────────────────────────────────────────────
// Prefer the service role key (needed to read profiles for tier verification).
// Falls back to the anon key for quota-only tracking if service key isn't set.
const supabaseUrl      = process.env.VITE_SUPABASE_URL;
const supabaseKey      = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseAdmin    = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/** Returns true if the Supabase session token belongs to a Pro/trial user. */
async function isProUser(accessToken: string): Promise<boolean> {
  if (!supabaseAdmin || !accessToken) return false;
  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(accessToken);
    if (!user) return false;
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("subscription_tier, trial_ends_at")
      .eq("id", user.id)
      .single();
    if (!data) return false;
    if (data.subscription_tier === "pro" || data.subscription_tier === "lifetime") return true;
    if (data.trial_ends_at && new Date(data.trial_ends_at) > new Date()) return true;
    return false;
  } catch {
    return false; // Fail open — don't block a user over a verification error
  }
}

async function checkAndIncrementQuota(identifier: string): Promise<boolean> {
  if (!supabaseAdmin) return true; // Supabase not configured — skip quota

  const today = new Date().toISOString().split("T")[0];

  try {
    const { data } = await supabaseAdmin
      .from("ai_usage")
      .select("count")
      .eq("user_hash", identifier)
      .eq("date", today)
      .maybeSingle();

    const currentCount = data?.count ?? 0;
    if (currentCount >= DAILY_LIMIT) return false;

    await supabaseAdmin.from("ai_usage").upsert(
      { user_hash: identifier, date: today, count: currentCount + 1 },
      { onConflict: "user_hash,date" }
    );
    return true;
  } catch {
    return true; // On unexpected error, allow through (graceful degradation)
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: "Server API key not configured. Ask the host to set GEMINI_API_KEY in Netlify environment variables." } }),
    };
  }

  let model: string;
  let payload: object;
  let accessCode: string | undefined;
  let sessionToken: string | undefined;
  try {
    const parsed = JSON.parse(event.body ?? "{}");
    model        = parsed.model;
    payload      = parsed.payload;
    accessCode   = parsed.accessCode;
    sessionToken = parsed.sessionToken;
    if (!model || !payload) throw new Error("Missing model or payload");

    // Enforce input length limit to prevent token-limit errors and abuse
    const contents = (payload as Record<string, unknown>).contents;
    if (Array.isArray(contents) && contents.length > 0) {
      const lastContent = contents[contents.length - 1] as Record<string, unknown>;
      const parts = lastContent?.parts;
      if (Array.isArray(parts)) {
        const text = (parts[0] as Record<string, unknown>)?.text;
        if (typeof text === "string" && text.length > 4000) {
          return { statusCode: 400, body: JSON.stringify({ error: { message: "Question too long (max 4000 characters)." } }) };
        }
      }
    }
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: { message: `Bad request: ${err}` } }) };
  }

  // ── Quota bypass checks (access code OR verified Pro/trial subscription) ──
  const serverCode  = process.env.ACCESS_CODE;
  const codeIsValid = serverCode
    ? (accessCode?.trim().toUpperCase() === serverCode.trim().toUpperCase())
    : false;
  const proUser     = codeIsValid ? false : await isProUser(sessionToken ?? "");
  const bypassQuota = codeIsValid || proUser;

  // ── Per-IP daily quota (skipped for Pro users and access-code holders) ────
  if (!bypassQuota) {
    const clientIp =
      event.headers["x-forwarded-for"]?.split(",")[0].trim()
      ?? event.headers["x-nf-client-connection-ip"]
      ?? "unknown";
    const ipHash = createHash("sha256").update(clientIp).digest("hex").substring(0, 32);

    const withinQuota = await checkAndIncrementQuota(ipHash);
    if (!withinQuota) {
      return {
        statusCode: 429,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: {
            message: `Daily question limit reached (${DAILY_LIMIT}/day on the shared key). Add your own Gemini API key in Settings for unlimited questions.`,
          },
        }),
      };
    }
  }

  // ── Forward to Gemini ─────────────────────────────────────────────────────
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const data = await upstream.json();
  return {
    statusCode: upstream.status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
};

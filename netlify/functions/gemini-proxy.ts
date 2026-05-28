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

// ── Supabase client (quota tracking) ────────────────────────────────────────
// Uses the same env vars as the frontend (Netlify exposes all vars to functions)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseAdmin = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

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
  try {
    const parsed = JSON.parse(event.body ?? "{}");
    model      = parsed.model;
    payload    = parsed.payload;
    accessCode = parsed.accessCode;
    if (!model || !payload) throw new Error("Missing model or payload");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: { message: `Bad request: ${err}` } }) };
  }

  // ── Access-code quota bypass ──────────────────────────────────────────────
  // ACCESS_CODE is optional. When set, providing the correct code bypasses the
  // daily quota entirely (for testing / admin use). Wrong or missing code just
  // means the normal per-IP quota applies — users are never hard-blocked.
  const serverCode = process.env.ACCESS_CODE;
  const codeIsValid = serverCode
    ? (accessCode?.trim().toUpperCase() === serverCode.trim().toUpperCase())
    : false;

  // ── Per-IP daily quota (skipped when access code matches) ────────────────
  if (!codeIsValid) {
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

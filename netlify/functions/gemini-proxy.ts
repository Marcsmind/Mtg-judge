/**
 * Netlify serverless function — Gemini API proxy
 *
 * Keeps the GEMINI_API_KEY server-side only (set in Netlify → Site configuration
 * → Environment variables). Trusted friends can use the shared key by entering
 * the ACCESS_CODE you give them in the app Settings.
 *
 * POST body: { model: string, payload: object, accessCode?: string }
 * Returns:   the raw Gemini API JSON response
 *
 * Access-code gate:
 *   - If ACCESS_CODE env var is set, the request body must include a matching
 *     `accessCode` field — otherwise the proxy returns 403.
 *   - If ACCESS_CODE is NOT set (local dev / open deployment), any request passes.
 */
import type { Handler } from "@netlify/functions";

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

  // ── Access-code gate ──────────────────────────────────────────────────────
  // Only enforced when ACCESS_CODE is configured in Netlify env vars.
  // Comparison is done server-side so the code is never exposed to the client.
  const requiredCode = process.env.ACCESS_CODE;
  if (requiredCode) {
    if (!accessCode || accessCode.trim().toUpperCase() !== requiredCode.trim().toUpperCase()) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: { message: "Invalid access code. Ask the app owner for the correct code and enter it in Settings → Server Access Code." } }),
      };
    }
  }

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

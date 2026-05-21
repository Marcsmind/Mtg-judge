/**
 * Netlify serverless function — Gemini API proxy
 *
 * Keeps the GEMINI_API_KEY server-side only (set in Netlify → Site configuration
 * → Environment variables). Friends who visit the app never need their own key.
 *
 * POST body: { model: string, payload: object }
 * Returns:   the raw Gemini API JSON response
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
  try {
    const parsed = JSON.parse(event.body ?? "{}");
    model   = parsed.model;
    payload = parsed.payload;
    if (!model || !payload) throw new Error("Missing model or payload");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: { message: `Bad request: ${err}` } }) };
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

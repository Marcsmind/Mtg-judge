/**
 * Netlify serverless function — Google Cloud Vision API proxy.
 *
 * Keeps the Vision API key off the client bundle.
 *
 * Environment variables (set in Netlify → Site configuration → Environment):
 *   GOOGLE_VISION_API_KEY — GCP API key with Cloud Vision API enabled
 *
 * POST body: { imageBase64: string }   // base64-encoded JPEG, no data: prefix
 * Response:  { text: string } | { error: string }
 */

import type { Handler } from "@netlify/functions";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Vision API not configured" }) };
  }

  let imageBase64: string;
  try {
    const body = JSON.parse(event.body ?? "{}");
    imageBase64 = body.imageBase64;
    if (!imageBase64) throw new Error("missing");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing imageBase64 in request body" }) };
  }

  try {
    const res = await fetch(`${VISION_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
          imageContext: { languageHints: ["en"] },
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[vision-proxy] API error:", res.status, err);
      return { statusCode: res.status, body: JSON.stringify({ error: "Vision API error" }) };
    }

    const data = await res.json();
    const fullText: string = data.responses?.[0]?.textAnnotations?.[0]?.description ?? "";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ text: fullText }),
    };
  } catch (err) {
    console.error("[vision-proxy] fetch failed:", err);
    return { statusCode: 502, body: JSON.stringify({ error: "Failed to reach Vision API" }) };
  }
};

export { handler };

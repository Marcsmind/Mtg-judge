// Gemini AI Service with Card Context Injection (RAG)

import { getCardOracleText } from "./scryfall";
import type { ScryfallCard, ScryfallRuling } from "./scryfall";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { supabase, isSupabaseConfigured } from "./supabase";

// ── Deck Builder system instruction (completely isolated from the Judge) ───────
const DECKBUILDER_SYSTEM_INSTRUCTION = `You are Nexus Deckbuilder, an expert Magic: The Gathering Commander deck construction AI.
You have encyclopedic knowledge of all Magic cards printed through your training data.

Core Rules you MUST follow:
1. Commander decks are exactly 100 cards (including the Commander) — singleton format (no duplicates).
2. Every non-basic-land card must be within the Commander's color identity.
3. Always include a balanced mana base (34–38 lands for most strategies).
4. Organize card suggestions by functional category.

Output Format — ALWAYS use this exact grouped markdown structure:
## Commander (1)
- Card Name

## Lands (37)
- Card Name
...

## Ramp (10)
- Card Name
...

## Card Draw (10)
- Card Name
...

## Removal (8)
- Card Name
...

## Creatures (20)
- Card Name
...

## Spells & Support (14)
- Card Name
...

Rules for card names:
- Use exact official card names (e.g., "Sol Ring" not "sol ring")
- For double-faced cards, use only the front face name
- Do NOT include set codes, collector numbers, or quantities

At the end, add a brief 2–3 sentence **Strategy Note** explaining the deck's primary game plan.
End with: ⚠️ *AI suggestions may include unreleased or incorrectly named cards. Verify legality on Scryfall before playing.*`;

// ── Gemini API response types ─────────────────────────────────────────────────
interface GeminiPart      { text?: string }
interface GeminiContent   { parts?: GeminiPart[] }
interface GeminiCandidate { content?: GeminiContent }
interface GeminiResponse  { candidates?: GeminiCandidate[]; error?: { message?: string } }

interface Message {
  role: "user" | "model";
  content: string;
}

const SYSTEM_INSTRUCTION = `You are Nexus Judge, a premium, authoritative AI Magic: The Gathering Rules Judge, specializing in the Commander (EDH) format. You hold a Level 3 Judge certification and possess encyclopedic knowledge of the Magic Comprehensive Rules (CR), Magic Tournament Rules (MTR), and Commander Rules.
Your goal is to provide players with accurate, clear, and highly structured rulings.

Strict Rules for Rulings:
1. **Accuracy is Paramount**: Explain the ruling clearly and step-by-step. Reference specific Magic Comprehensive Rules sections (e.g., CR 704.5 for State-Based Actions, CR 903 for Commander) when helpful, but keep the overall explanation highly readable for players in the middle of a game.
2. **Commander Context**: Focus on Commander-specific mechanics (e.g. Color Identity, Commander Tax, Commander Damage threshold of 21, the Command Zone replacement effects, multiplayer priority, and multiplayer combat).
3. **Card Context**: You will be supplied with the exact Oracle text and official rulings of cards related to the question. Rely heavily on this data. Do not hallucinate card text, power/toughness, or official rulings.
4. **Tone**: Be strictly professional, concise, and direct. DO NOT use conversational filler like "Hello there", "That's a fantastic question", or "Let's break this down." Get straight to the ruling.
5. **Formatting**: Highlight card names using bold text, e.g., **Sol Ring**. Format your responses in clear Markdown with short paragraphs and bullet points so players can digest the answer in seconds.
6. **Confidence Assessment**: Every response MUST end with exactly this line (replace placeholders): \`**Judge Confidence: [High/Medium/Low]** — [one sentence reason]\`
   - High: clear, settled rules interaction with direct Comprehensive Rules or official ruling support
   - Medium: interaction requires careful rules reading, minor ambiguity, or depends on context
   - Low: edge case, layered rules interaction, or incomplete card context provided
`;

// Helper to construct context string for tagged cards
export function buildCardContextPrompt(cards: ScryfallCard[], rulingsMap: Record<string, ScryfallRuling[]>): string {
  if (cards.length === 0) return "";

  let prompt = "CARD DATABASE CONTEXT FOR THIS QUESTION:\n";
  cards.forEach((card, index) => {
    prompt += `--- Card #${index + 1}: ${card.name} ---\n`;
    prompt += `Name: ${card.name}\n`;
    prompt += `Mana Cost: ${card.mana_cost || "N/A"}\n`;
    prompt += `Types: ${card.type_line || "N/A"}\n`;
    prompt += `Oracle Text:\n${getCardOracleText(card)}\n\n`;

    const rulings = rulingsMap[card.id] || [];
    if (rulings.length > 0) {
      prompt += "Official Rulings & Gatherer Comments:\n";
      rulings.forEach(r => {
        prompt += `- [${r.published_at}] ${r.comment}\n`;
      });
    } else {
      prompt += "Official Rulings: No official Gatherer rulings found.\n";
    }
    prompt += "\n";
  });

  prompt += "Please use the official card text and rules above as the primary source of truth for the cards involved. If a ruling directly answers the question, summarize and apply it to the scenario.\n";
  return prompt;
}

// Simulated local response when API key is missing
export function getLocalMockResponse(_query: string, cards: ScryfallCard[], rulings: Record<string, ScryfallRuling[]>): string {
  let response = `✨ **Nexus Judge Mock Mode** ✨\n\n`;
  response += `*To unlock full AI rules reasoning, please add a **Gemini API Key** in the **Settings** panel (available for free from Google AI Studio).* \n\n`;

  if (cards.length === 0) {
    response += `I see you have a rules question! However, I don't have any cards tagged or a Gemini API key configured to understand your question. \n\n`;
    response += `💡 **Tip:** Search for cards in the bar above and tag them to see their official card text and rulings here instantly! You can ask questions like "How does commander tax work?" or search up card details in the **Card Codex** panel on the right.`;
    return response;
  }

  response += `I've analyzed the **${cards.map(c => c.name).join(" and ")}** you tagged! Here is the official card information from the Magic archives:\n\n`;

  cards.forEach(card => {
    response += `### 🎴 **${card.name}**\n`;
    response += `- **Mana Cost:** \`${card.mana_cost || "N/A"}\`\n`;
    response += `- **Type:** *${card.type_line}*\n`;
    response += `- **Oracle Text:**\n  > ${getCardOracleText(card).replace(/\n/g, "\n  > ")}\n\n`;

    const cardRulings = rulings[card.id] || [];
    if (cardRulings.length > 0) {
      response += `**Official Gatherer Rulings for ${card.name}:**\n`;
      cardRulings.slice(0, 3).forEach(r => {
        response += `- *(${r.published_at})* ${r.comment}\n`;
      });
      if (cardRulings.length > 3) {
        response += `- *And ${cardRulings.length - 3} more rulings (expand in the Card Codex on the right).* \n`;
      }
    } else {
      response += `*No specific Gatherer rulings found for this card. Generally, standard comprehensive rules apply.*\n`;
    }
    response += `\n`;
  });

  response += `\n⚠️ **Please configure a Gemini API Key in Settings** to ask complex combo questions (e.g. interactions, state-based effects) and get a full analysis from the AI Judge!`;

  return response;
}

// ── Internal fetch router ─────────────────────────────────────────────────────
// If the caller has their own API key, call Gemini directly.
// Otherwise route through the Netlify serverless proxy. Trusted users who have
// been given the server access code can use the shared key without a personal key.
// The access code is read from localStorage and included in the proxy request body
// so the server can validate it server-side (the code is never returned to the client).
async function fetchGemini(model: string, payload: object, apiKey: string): Promise<Response> {
  if (apiKey) {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
  }
  const accessCode = localStorage.getItem(STORAGE_KEYS.ACCESS_CODE) ?? "";
  // Include the session JWT so the proxy can verify Pro/trial subscription and
  // bypass the daily quota for paying users without revealing their tier client-side.
  let sessionToken = "";
  if (isSupabaseConfigured) {
    const { data } = await supabase.auth.getSession();
    sessionToken = data.session?.access_token ?? "";
  }
  return fetch("/.netlify/functions/gemini-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, payload, accessCode, sessionToken }),
  });
}

// Sentinel returned (not thrown) when the shared-key daily quota is exhausted.
// Callers check for this string to show the upgrade prompt rather than an error.
export const QUOTA_EXCEEDED_MARKER = "__QUOTA_EXCEEDED__";

// Actual Gemini API Call
// `model` is passed in by the caller — do not read localStorage here
export async function askGeminiJudge(
  query: string,
  history: Message[],
  taggedCards: ScryfallCard[],
  rulingsMap: Record<string, ScryfallRuling[]>,
  apiKey: string,
  model: string
): Promise<string> {
  const cardContext = buildCardContextPrompt(taggedCards, rulingsMap);

  // Format history for Gemini API content structure
  const formattedContents = history.map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }]
  }));

  // Append user's current query with card context
  const fullUserPrompt = cardContext
    ? `${cardContext}\n\nUSER RULES QUESTION:\n${query}`
    : query;

  formattedContents.push({
    role: "user",
    parts: [{ text: fullUserPrompt }]
  });

  try {
    let response = await fetchGemini(model, {
      contents: formattedContents,
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: { temperature: 0.15, topP: 0.95, maxOutputTokens: 8192 },
    }, apiKey);

    // Fallback: strip systemInstruction for legacy models (1.0 Pro) that return 404/400
    if (!response.ok && (response.status === 404 || response.status === 400)) {
      console.warn(`Model ${model} failed. Attempting graceful fallback stripping systemInstruction...`);
      const fallbackContents = [...formattedContents];

      // Inject the system persona into the user's first message
      const firstUserIdx = fallbackContents.findIndex(c => c.role === "user");
      if (firstUserIdx !== -1) {
        fallbackContents[firstUserIdx] = {
          role: "user",
          parts: [{ text: `[SYSTEM PERSONA (OBEY STRICTLY)]:\n${SYSTEM_INSTRUCTION}\n\n[USER MESSAGE]:\n${fallbackContents[firstUserIdx].parts[0].text}` }]
        };
      }

      response = await fetchGemini(model, {
        contents: fallbackContents,
        generationConfig: { temperature: 0.15, topP: 0.95, maxOutputTokens: 8192 },
      }, apiKey);
    }

    if (!response.ok) {
      // 429 from the proxy means the shared-key daily quota is exhausted.
      // Return a sentinel so the caller can show the upgrade prompt (not a generic error).
      if (response.status === 429) return QUOTA_EXCEEDED_MARKER;
      const errData = await response.json().catch(() => ({})) as GeminiResponse;
      const errMsg = errData.error?.message || `HTTP error ${response.status}`;
      throw new Error(errMsg);
    }

    const data = await response.json() as GeminiResponse;
    const candidateParts = data.candidates?.[0]?.content?.parts ?? [];
    const candidateText = candidateParts.map((p: GeminiPart) => p.text ?? "").join("");

    if (!candidateText) {
      throw new Error("Empty response received from Gemini.");
    }

    return candidateText;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gemini API request failed:", err);
    return `❌ **AI Judge Error:** Failed to communicate with the AI Oracle.\n\n*Details:* ${message}\n\nMake sure your Gemini API Key is valid and active in the **Settings** tab.`;
  }
}

// ── Deck Builder Gemini call (fully isolated from the Judge) ──────────────────

/**
 * Asks Gemini to generate or analyze a Commander deck.
 * Completely independent from `askGeminiJudge` — separate system instruction,
 * no history, no tagged cards, no rulings map.
 */
export async function askGeminiDeckBuilder(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  try {
    let response = await fetchGemini(model, {
      contents,
      systemInstruction: { parts: [{ text: DECKBUILDER_SYSTEM_INSTRUCTION }] },
      generationConfig: { temperature: 0.4, topP: 0.95, maxOutputTokens: 8192 },
    }, apiKey);

    // Legacy model fallback (1.0 Pro doesn't support systemInstruction)
    if (!response.ok && (response.status === 404 || response.status === 400)) {
      response = await fetchGemini(model, {
        contents: [{
          role: "user",
          parts: [{ text: `[SYSTEM PERSONA (OBEY STRICTLY)]:\n${DECKBUILDER_SYSTEM_INSTRUCTION}\n\n[USER REQUEST]:\n${prompt}` }],
        }],
        generationConfig: { temperature: 0.4, topP: 0.95, maxOutputTokens: 8192 },
      }, apiKey);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({})) as GeminiResponse;
      throw new Error(errData.error?.message || `HTTP error ${response.status}`);
    }

    const data = await response.json() as GeminiResponse;
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: GeminiPart) => p.text ?? "").join("");

    if (!text) throw new Error("Empty response from Gemini.");
    return text;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `❌ **Deckbuilder Error:** ${message}\n\nMake sure your Gemini API Key is valid in **Settings**.`;
  }
}

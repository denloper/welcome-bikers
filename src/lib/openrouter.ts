import type { PlaceType } from "../types";
import { chatUrl, resolveProxyBase } from "./orProxy";

/** Fast + smart default; fallbacks listed in the request body. */
const MODEL = "google/gemini-2.5-flash";
const FALLBACK_MODELS = ["openai/gpt-4o-mini", "google/gemini-2.0-flash-001"];

const PLACE_TYPES = new Set<PlaceType>([
  "hotels",
  "shops",
  "bars",
  "restaurants",
  "services",
  "rent",
  "festivals",
  "viewpoints",
  "historical",
]);

export type BroChatTurn = { role: "user" | "assistant"; content: string };

export type BroAiResult = {
  reply: string;
  intent: "chat" | "ride" | "category";
  query?: string;
  type?: PlaceType;
  country?: string;
};

const SYSTEM = `You are Real Bro — the in-app AI for Welcome Bikers (motorcycle travel, Balkans & Europe).
Speak English only. Short (1-3 sentences), male biker vibe: witty, direct, helpful, a bit street. No emoji spam.
You help riders: build routes, find hotels / moto shops / bars / restaurants / services / rent / festivals / viewpoints / historical places, and give quick riding tips for the region.
If the user wants to go somewhere, set intent "ride" and put the destination in query.
If they ask for a place type, set intent "category", type to one of hotels|shops|bars|restaurants|services|rent|festivals|viewpoints|historical, and country when clear (English country name, e.g. Montenegro).
Otherwise intent "chat". Still answer smartly; if unsure how to help, nudge them toward "ride to …" or "what bars are in Montenegro".
Reply with JSON only, no markdown:
{"reply":"...","intent":"chat"|"ride"|"category","query":"...","type":"...","country":"..."}
Omit unused fields.`;

export function hasOpenRouter(): boolean {
  // Calls always go through the CORS proxy (env URL or runtime discovery).
  return true;
}

function extractJson(raw: string): unknown {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeResult(parsed: unknown, fallbackReply: string): BroAiResult {
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const reply = String(obj.reply ?? fallbackReply).trim() || fallbackReply;
  const intentRaw = String(obj.intent ?? "chat").toLowerCase();
  const intent: BroAiResult["intent"] =
    intentRaw === "ride" || intentRaw === "category" ? intentRaw : "chat";
  const query = obj.query != null ? String(obj.query).trim() : undefined;
  const typeRaw = obj.type != null ? String(obj.type).trim() : undefined;
  const type = typeRaw && PLACE_TYPES.has(typeRaw as PlaceType) ? (typeRaw as PlaceType) : undefined;
  const country = obj.country != null ? String(obj.country).trim() : undefined;
  if (intent === "ride" && !query) return { reply, intent: "chat" };
  if (intent === "category" && !type) return { reply, intent: "chat" };
  return { reply, intent, query, type, country };
}

/** Ask Real Bro via CORS proxy (OpenRouter key stays server-side). Returns null on failure. */
export async function askRealBro(userText: string, history: BroChatTurn[] = []): Promise<BroAiResult | null> {
  if (!userText.trim()) return null;
  const base = await resolveProxyBase();
  if (!base) return null;

  const messages: { role: string; content: string }[] = [
    { role: "system", content: SYSTEM },
    ...history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userText.trim() },
  ];
  try {
    const res = await fetch(chatUrl(base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        models: FALLBACK_MODELS,
        temperature: 0.55,
        max_tokens: 220,
        messages,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      error?: { message?: string };
    };
    if (data.error) return null;
    const content = String(data.choices?.[0]?.message?.content ?? "").trim();
    if (!content) return null;
    const parsed = extractJson(content);
    if (parsed) return normalizeResult(parsed, content);
    return { reply: content.replace(/^```(?:json)?|```$/g, "").trim(), intent: "chat" };
  } catch {
    return null;
  }
}

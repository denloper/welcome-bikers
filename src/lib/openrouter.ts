import type { PlaceType } from "../types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Fast model; :nitro picks the highest-throughput provider. */
const MODEL = "google/gemini-2.5-flash:nitro";

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

function apiKey(): string {
  return String(import.meta.env.VITE_OPENROUTER_API_KEY || "").trim();
}

export function hasOpenRouter(): boolean {
  return apiKey().length > 0;
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

function normalizeResult(raw: unknown, fallbackReply: string): BroAiResult {
  if (!raw || typeof raw !== "object") {
    return { reply: fallbackReply || "Yo. Say where you wanna ride, bro.", intent: "chat" };
  }
  const o = raw as Record<string, unknown>;
  const reply = String(o.reply || fallbackReply || "").trim() || "Yo. Say where you wanna ride, bro.";
  const intentRaw = String(o.intent || "chat").toLowerCase();
  const intent: BroAiResult["intent"] =
    intentRaw === "ride" || intentRaw === "category" ? intentRaw : "chat";
  const query = o.query != null ? String(o.query).trim() : undefined;
  const typeRaw = o.type != null ? String(o.type).trim().toLowerCase() : "";
  const type = PLACE_TYPES.has(typeRaw as PlaceType) ? (typeRaw as PlaceType) : undefined;
  const country = o.country != null ? String(o.country).trim() : undefined;
  if (intent === "ride" && !query) return { reply, intent: "chat" };
  if (intent === "category" && !type) return { reply, intent: "chat" };
  return { reply, intent, query, type, country };
}

/** Ask Real Bro via OpenRouter. Returns null when the key is missing or the call fails. */
export async function askRealBro(userText: string, history: BroChatTurn[] = []): Promise<BroAiResult | null> {
  const key = apiKey();
  if (!key || !userText.trim()) return null;
  const messages: { role: string; content: string }[] = [
    { role: "system", content: SYSTEM },
    ...history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userText.trim() },
  ];
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://denloper.github.io/welcome-bikers/",
        "X-Title": "Welcome Bikers Real Bro",
      },
      body: JSON.stringify({
        model: MODEL,
        models: ["google/gemini-2.5-flash", "openai/gpt-4o-mini"],
        temperature: 0.55,
        max_tokens: 220,
        messages,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content);
    if (parsed) return normalizeResult(parsed, content);
    const plain = content.trim();
    if (!plain) return null;
    return { reply: plain.replace(/^```(?:json)?|```$/g, "").trim(), intent: "chat" };
  } catch {
    return null;
  }
}

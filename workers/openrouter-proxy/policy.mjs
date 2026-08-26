const DEFAULT_ORIGINS = [
  "https://denloper.github.io",
  "https://localhost",
  "capacitor://localhost",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://localhost:5173",
];

const ENDPOINTS = {
  "/chat": {
    upstream: "https://openrouter.ai/api/v1/chat/completions",
    maxBytes: 64 * 1024,
  },
  "/speech": {
    upstream: "https://openrouter.ai/api/v1/audio/speech",
    maxBytes: 32 * 1024,
  },
  "/transcribe": {
    upstream: "https://openrouter.ai/api/v1/audio/transcriptions",
    maxBytes: 12 * 1024 * 1024,
  },
};

const CHAT_MODELS = new Set([
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
]);
const SPEECH_MODELS = new Set([
  "minimax/speech-2.8-turbo",
  "deepgram/aura-2",
  "google/gemini-3.1-flash-tts-preview",
]);
const AUDIO_FORMATS = new Set(["webm", "m4a", "aac", "ogg"]);
const rateBuckets = new Map();
const MAX_RATE_BUCKETS = 10_000;

export function allowedOrigins(raw = "") {
  const configured = String(raw)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ORIGINS);
}

export function isAllowedOrigin(origin, origins) {
  return Boolean(origin && origins.has(origin));
}

export function corsHeaders(origin, origins) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin, origins)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function endpointFor(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  return ENDPOINTS[path] ? { path, ...ENDPOINTS[path] } : null;
}

export function checkRateLimit(key, limit = 40, windowMs = 60_000, now = Date.now()) {
  const safeLimit = Math.max(1, Number(limit) || 40);
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (!bucket && rateBuckets.size >= MAX_RATE_BUCKETS) {
      for (const [bucketKey, value] of rateBuckets) {
        if (now >= value.resetAt) rateBuckets.delete(bucketKey);
      }
      while (rateBuckets.size >= MAX_RATE_BUCKETS) {
        const oldest = rateBuckets.keys().next().value;
        if (oldest == null) break;
        rateBuckets.delete(oldest);
      }
    }
    const next = { count: 1, resetAt: now + windowMs };
    rateBuckets.set(key, next);
    return { allowed: true, remaining: safeLimit - 1, retryAfter: 0 };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= safeLimit,
    remaining: Math.max(0, safeLimit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function cleanChat(body) {
  const source = objectValue(body);
  if (!source || !Array.isArray(source.messages) || source.messages.length === 0) {
    throw new Error("Chat messages are required");
  }
  const messages = source.messages.slice(-10).map((entry) => {
    const message = objectValue(entry);
    const role = String(message?.role || "");
    const content = String(message?.content || "").trim();
    if (!["system", "user", "assistant"].includes(role) || !content || content.length > 4_000) {
      throw new Error("Invalid chat message");
    }
    return { role, content };
  });
  const requestedModel = String(source.model || "");
  const model = CHAT_MODELS.has(requestedModel) ? requestedModel : "google/gemini-2.5-flash";
  const models = Array.isArray(source.models)
    ? source.models.map(String).filter((value) => CHAT_MODELS.has(value) && value !== model).slice(0, 2)
    : [];
  return {
    model,
    models,
    messages,
    temperature: Math.min(1, Math.max(0, Number(source.temperature) || 0.55)),
    max_tokens: Math.min(300, Math.max(1, Number(source.max_tokens) || 220)),
    response_format: { type: "json_object" },
  };
}

function cleanSpeech(body) {
  const source = objectValue(body);
  const model = String(source?.model || "");
  const input = String(source?.input || "").trim();
  if (!source || !SPEECH_MODELS.has(model) || !input || input.length > 1_200) {
    throw new Error("Invalid speech request");
  }
  const cleaned = {
    model,
    input,
    voice: String(source.voice || "").slice(0, 80),
    response_format: source.response_format === "pcm" ? "pcm" : "mp3",
  };
  if (Number.isFinite(Number(source.speed))) {
    cleaned.speed = Math.min(1.2, Math.max(0.8, Number(source.speed)));
  }
  if (model === "google/gemini-3.1-flash-tts-preview") {
    const prompt = String(source.provider?.options?.google?.prompt || "").slice(0, 300);
    if (prompt) cleaned.provider = { options: { google: { prompt } } };
  }
  return cleaned;
}

function cleanTranscription(body) {
  const source = objectValue(body);
  const inputAudio = objectValue(source?.input_audio);
  const data = String(inputAudio?.data || "");
  const format = String(inputAudio?.format || "").toLowerCase();
  if (!source || !data || !AUDIO_FORMATS.has(format)) {
    throw new Error("Invalid transcription request");
  }
  return {
    model: "openai/whisper-1",
    input_audio: { data, format },
  };
}

export function sanitizeBody(path, bytes) {
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Request body must be valid JSON");
  }
  const cleaned =
    path === "/chat" ? cleanChat(parsed) : path === "/speech" ? cleanSpeech(parsed) : cleanTranscription(parsed);
  return new TextEncoder().encode(JSON.stringify(cleaned));
}

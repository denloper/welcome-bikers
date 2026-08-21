/**
 * Welcome Bikers — OpenRouter proxy (CORS + server-side API key).
 * Routes:
 *   POST /chat       -> https://openrouter.ai/api/v1/chat/completions
 *   POST /speech     -> https://openrouter.ai/api/v1/audio/speech
 *   POST /transcribe -> https://openrouter.ai/api/v1/audio/transcriptions
 *   OPTIONS /*       -> CORS preflight
 */

const ALLOWED = [
  "https://denloper.github.io",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://localhost:5173",
  "https://localhost",
  "capacitor://localhost",
];

function corsHeaders(origin) {
  const allow = ALLOWED.includes(origin) || /^https:\/\/([a-z0-9-]+\.)?denloper\.github\.io$/.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ? origin
    : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Title, HTTP-Referer",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return json(200, { ok: true, service: "welcome-bikers-openrouter-proxy" }, origin);
    }

    if (request.method !== "POST") {
      return json(405, { error: "Method not allowed" }, origin);
    }

    const key = String(env.OPENROUTER_API_KEY || "").trim();
    if (!key) {
      return json(500, { error: "Proxy misconfigured: missing OPENROUTER_API_KEY" }, origin);
    }

    let upstream;
    if (path === "/chat" || path.endsWith("/chat")) {
      upstream = "https://openrouter.ai/api/v1/chat/completions";
    } else if (path === "/speech" || path.endsWith("/speech")) {
      upstream = "https://openrouter.ai/api/v1/audio/speech";
    } else if (path === "/transcribe" || path.endsWith("/transcribe")) {
      upstream = "https://openrouter.ai/api/v1/audio/transcriptions";
    } else {
      return json(404, { error: "Not found. Use POST /chat, /speech, or /transcribe" }, origin);
    }

    const body = await request.arrayBuffer();
    const contentType = request.headers.get("Content-Type") || "application/json";
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
        "HTTP-Referer": "https://denloper.github.io/welcome-bikers/",
        "X-Title": "Welcome Bikers",
        "User-Agent": "WelcomeBikersProxy/1.0 (+https://denloper.github.io/welcome-bikers/)",
      },
      body,
    });

    const headers = new Headers(corsHeaders(origin));
    const ct = upstreamRes.headers.get("Content-Type");
    if (ct) headers.set("Content-Type", ct);
    const gen = upstreamRes.headers.get("X-Generation-Id");
    if (gen) headers.set("X-Generation-Id", gen);

    return new Response(upstreamRes.body, { status: upstreamRes.status, headers });
  },
};

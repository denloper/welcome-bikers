/**
 * Welcome Bikers OpenRouter proxy — Node (Railway / local / GitHub runner).
 * POST /chat, POST /speech; OPTIONS for CORS. Key stays server-side.
 */
import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const KEY = String(process.env.OPENROUTER_API_KEY || "").trim();
const ALLOWED = new Set([
  "https://denloper.github.io",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://localhost:5173",
]);

function corsOrigin(origin) {
  if (!origin) return "https://denloper.github.io";
  if (ALLOWED.has(origin)) return origin;
  if (/^https:\/\/([a-z0-9-]+\.)?denloper\.github\.io$/.test(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return "https://denloper.github.io";
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Title, HTTP-Referer",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function sendJson(res, status, body, origin) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...corsHeaders(origin),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (req.method === "GET" && (path === "/" || path === "/health")) {
    sendJson(res, 200, { ok: true, service: "welcome-bikers-openrouter-proxy" }, origin);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" }, origin);
    return;
  }

  if (!KEY) {
    sendJson(res, 500, { error: "Proxy misconfigured: missing OPENROUTER_API_KEY" }, origin);
    return;
  }

  let upstream;
  if (path === "/chat") upstream = "https://openrouter.ai/api/v1/chat/completions";
  else if (path === "/speech") upstream = "https://openrouter.ai/api/v1/audio/speech";
  else {
    sendJson(res, 404, { error: "Not found. Use POST /chat or POST /speech" }, origin);
    return;
  }

  try {
    const body = await readBody(req);
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://denloper.github.io/welcome-bikers/",
        "X-Title": "Welcome Bikers",
      },
      body,
    });
    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    const headers = {
      ...corsHeaders(origin),
      "Content-Type": upstreamRes.headers.get("content-type") || "application/octet-stream",
      "Content-Length": buf.length,
    };
    const gen = upstreamRes.headers.get("x-generation-id");
    if (gen) headers["X-Generation-Id"] = gen;
    res.writeHead(upstreamRes.status, headers);
    res.end(buf);
  } catch (err) {
    sendJson(res, 502, { error: "Upstream failed", detail: String(err?.message || err) }, origin);
  }
});

server.listen(PORT, () => {
  console.log(`welcome-bikers-openrouter-proxy on :${PORT}`);
});

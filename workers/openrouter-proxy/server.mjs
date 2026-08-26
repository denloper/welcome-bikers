/**
 * Welcome Bikers OpenRouter proxy — Node (Railway / local / GitHub runner).
 * POST /chat, POST /speech, POST /transcribe; OPTIONS for CORS. Key stays server-side.
 */
import http from "node:http";
import {
  allowedOrigins,
  checkRateLimit,
  corsHeaders,
  endpointFor,
  isAllowedOrigin,
  sanitizeBody,
} from "./policy.mjs";

const PORT = Number(process.env.PORT || 8787);
const KEY = String(process.env.OPENROUTER_API_KEY || "").trim();
const ORIGINS = allowedOrigins(process.env.ALLOWED_ORIGINS);
const RATE_LIMIT = Math.max(1, Number(process.env.PROXY_RATE_LIMIT || 40));
const APP_URL = String(process.env.PUBLIC_APP_URL || "https://denloper.github.io/welcome-bikers/").trim();
const UPSTREAM_TIMEOUT_MS = Math.max(5_000, Number(process.env.UPSTREAM_TIMEOUT_MS || 45_000));
const TRUST_PROXY = String(process.env.TRUST_PROXY || "").toLowerCase() === "true";

function sendJson(res, status, body, origin) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...corsHeaders(origin, ORIGINS),
  });
  res.end(payload);
}

async function readBody(req, maxBytes) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > maxBytes) throw Object.assign(new Error("Request body is too large"), { status: 413 });
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, ORIGINS)) {
      sendJson(res, 403, { error: "Origin not allowed" }, origin);
      return;
    }
    res.writeHead(204, corsHeaders(origin, ORIGINS));
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

  if (!isAllowedOrigin(origin, ORIGINS)) {
    sendJson(res, 403, { error: "Origin not allowed" }, origin);
    return;
  }

  if (!KEY) {
    sendJson(res, 500, { error: "Proxy misconfigured: missing OPENROUTER_API_KEY" }, origin);
    return;
  }

  const endpoint = endpointFor(path);
  if (!endpoint) {
    sendJson(res, 404, { error: "Not found. Use POST /chat, /speech, or /transcribe" }, origin);
    return;
  }

  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { error: "Content-Type must be application/json" }, origin);
    return;
  }

  const forwarded = TRUST_PROXY ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "";
  const client = forwarded || req.socket.remoteAddress || "unknown";
  const rate = checkRateLimit(`${client}:${path}`, RATE_LIMIT);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfter));
    sendJson(res, 429, { error: "Rate limit exceeded" }, origin);
    return;
  }

  let body;
  try {
    const rawBody = await readBody(req, endpoint.maxBytes);
    body = sanitizeBody(path, rawBody);
  } catch (err) {
    sendJson(res, Number(err?.status || 400), { error: String(err?.message || "Request rejected") }, origin);
    return;
  }

  const controller = new AbortController();
  const abortUpstream = () => controller.abort();
  const abortOnClosedResponse = () => {
    if (!res.writableFinished) controller.abort();
  };
  req.once("aborted", abortUpstream);
  res.once("close", abortOnClosedResponse);
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstreamRes = await fetch(endpoint.upstream, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": APP_URL,
        "X-Title": "Welcome Bikers",
      },
      body,
      signal: controller.signal,
    });
    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    const headers = {
      ...corsHeaders(origin, ORIGINS),
      "Content-Type": upstreamRes.headers.get("content-type") || "application/octet-stream",
      "Content-Length": buf.length,
      "X-RateLimit-Remaining": String(rate.remaining),
    };
    const gen = upstreamRes.headers.get("x-generation-id");
    if (gen) headers["X-Generation-Id"] = gen;
    res.writeHead(upstreamRes.status, headers);
    res.end(buf);
  } catch (err) {
    const status = err?.name === "AbortError" ? 504 : 502;
    const message = status === 504 ? "Upstream timed out" : String(err?.message || "Request rejected");
    sendJson(res, status, { error: message }, origin);
  } finally {
    clearTimeout(timeout);
    req.removeListener("aborted", abortUpstream);
    res.removeListener("close", abortOnClosedResponse);
  }
});

server.listen(PORT, () => {
  console.log(`welcome-bikers-openrouter-proxy on :${PORT}`);
});

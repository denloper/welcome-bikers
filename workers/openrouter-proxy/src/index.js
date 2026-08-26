import {
  allowedOrigins,
  checkRateLimit,
  corsHeaders,
  endpointFor,
  isAllowedOrigin,
  sanitizeBody,
} from "../policy.mjs";

function json(status, body, origin, origins, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin, origins), ...extraHeaders },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const origins = allowedOrigins(env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin, origins)) return json(403, { error: "Origin not allowed" }, origin, origins);
      return new Response(null, { status: 204, headers: corsHeaders(origin, origins) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return json(200, { ok: true, service: "welcome-bikers-openrouter-proxy" }, origin, origins);
    }

    if (request.method !== "POST") {
      return json(405, { error: "Method not allowed" }, origin, origins);
    }

    if (!isAllowedOrigin(origin, origins)) {
      return json(403, { error: "Origin not allowed" }, origin, origins);
    }

    const key = String(env.OPENROUTER_API_KEY || "").trim();
    if (!key) {
      return json(500, { error: "Proxy misconfigured: missing OPENROUTER_API_KEY" }, origin, origins);
    }

    const endpoint = endpointFor(path);
    if (!endpoint) {
      return json(404, { error: "Not found. Use POST /chat, /speech, or /transcribe" }, origin, origins);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return json(415, { error: "Content-Type must be application/json" }, origin, origins);
    }

    const declared = Number(request.headers.get("Content-Length") || 0);
    if (declared > endpoint.maxBytes) {
      return json(413, { error: "Request body is too large" }, origin, origins);
    }

    const client = request.headers.get("CF-Connecting-IP") || "unknown";
    const rate = checkRateLimit(`${client}:${path}`, Number(env.PROXY_RATE_LIMIT || 40));
    if (!rate.allowed) {
      return json(
        429,
        { error: "Rate limit exceeded" },
        origin,
        origins,
        { "Retry-After": String(rate.retryAfter) },
      );
    }

    let body;
    try {
      const raw = new Uint8Array(await request.arrayBuffer());
      if (raw.byteLength > endpoint.maxBytes) {
        return json(413, { error: "Request body is too large" }, origin, origins);
      }
      body = sanitizeBody(path, raw);
    } catch (error) {
      return json(400, { error: String(error?.message || "Request rejected") }, origin, origins);
    }

    const controller = new AbortController();
    const abortUpstream = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", abortUpstream, { once: true });
    const timeout = setTimeout(() => controller.abort(), Math.max(5_000, Number(env.UPSTREAM_TIMEOUT_MS || 45_000)));
    let upstreamRes;
    try {
      upstreamRes = await fetch(endpoint.upstream, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": String(env.PUBLIC_APP_URL || "https://denloper.github.io/welcome-bikers/"),
          "X-Title": "Welcome Bikers",
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      return json(timedOut ? 504 : 502, { error: timedOut ? "Upstream timed out" : "Upstream failed" }, origin, origins);
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortUpstream);
    }

    const headers = new Headers(corsHeaders(origin, origins));
    const ct = upstreamRes.headers.get("Content-Type");
    if (ct) headers.set("Content-Type", ct);
    const gen = upstreamRes.headers.get("X-Generation-Id");
    if (gen) headers.set("X-Generation-Id", gen);
    headers.set("X-RateLimit-Remaining", String(rate.remaining));

    return new Response(upstreamRes.body, { status: upstreamRes.status, headers });
  },
};

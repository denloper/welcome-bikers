/** Resolve CORS-friendly OpenRouter proxy base (no trailing slash). Key stays on the proxy. */

const viteEnv = import.meta.env ?? {};
const DISCOVERY_URLS = String(viteEnv.VITE_OPENROUTER_DISCOVERY_URL || "or-proxy.json")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

let resolved: string | null | undefined;
let resolving: Promise<string> | null = null;

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function proxyBaseFromEnv(): string {
  return normalizeBase(String(viteEnv.VITE_OPENROUTER_PROXY_URL || ""));
}

/** True when a proxy URL is baked in at build time (preferred). */
export function hasProxyEnv(): boolean {
  return proxyBaseFromEnv().length > 0;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function baseFromDiscoveryPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as { base?: unknown; content?: unknown; encoding?: unknown };
  if (typeof data.base === "string") return normalizeBase(data.base);
  if (data.encoding !== "base64" || typeof data.content !== "string") return "";
  try {
    const decoded = atob(data.content.replace(/\s/g, ""));
    const nested = JSON.parse(decoded) as { base?: unknown };
    return normalizeBase(typeof nested.base === "string" ? nested.base : "");
  } catch {
    return "";
  }
}

async function discoverProxyBase(): Promise<string> {
  for (const url of DISCOVERY_URLS) {
    try {
      const separator = url.includes("?") ? "&" : "?";
      const res = await fetchWithTimeout(`${url}${separator}t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      const base = baseFromDiscoveryPayload(await res.json());
      if (/^https:\/\//i.test(base)) return base;
    } catch {
      /* try next */
    }
  }
  return "";
}

/** Resolve proxy base: stable build-time URL first, optional discovery document second. */
export async function resolveProxyBase(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    resolved = undefined;
    resolving = null;
  }
  const fromEnv = proxyBaseFromEnv();
  if (fromEnv) {
    // Prefer env, but fall back to discovery if the baked URL is dead (ephemeral tunnels).
    try {
      const res = await fetchWithTimeout(`${fromEnv}/health`, { cache: "no-store" }, 4_000);
      if (res.ok) return fromEnv;
    } catch {
      /* fall through */
    }
  }
  if (resolved) {
    try {
      const res = await fetchWithTimeout(`${resolved}/health`, { cache: "no-store" }, 4_000);
      if (res.ok) return resolved;
    } catch {
      /* rediscover a rotated tunnel */
    }
    resolved = undefined;
  }
  if (!resolving) {
    resolving = discoverProxyBase().then((base) => {
      // Cache successes only — ephemeral tunnels / cold start must be retriable.
      resolved = base || undefined;
      resolving = null;
      return base;
    });
  }
  return resolving;
}

export function chatUrl(base: string): string {
  return `${normalizeBase(base)}/chat`;
}

export function speechUrl(base: string): string {
  return `${normalizeBase(base)}/speech`;
}

export function transcribeUrl(base: string): string {
  return `${normalizeBase(base)}/transcribe`;
}

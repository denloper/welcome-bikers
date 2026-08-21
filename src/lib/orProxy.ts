/** Resolve CORS-friendly OpenRouter proxy base (no trailing slash). Key stays on the proxy. */

const DISCOVERY_URLS = [
  "https://raw.githubusercontent.com/denloper/welcome-bikers/proxy-url/public/or-proxy.json",
  "https://denloper.github.io/welcome-bikers/or-proxy.json",
];

let resolved: string | null | undefined;
let resolving: Promise<string> | null = null;

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function proxyBaseFromEnv(): string {
  return normalizeBase(String(import.meta.env.VITE_OPENROUTER_PROXY_URL || ""));
}

/** True when a proxy URL is baked in at build time (preferred). */
export function hasProxyEnv(): boolean {
  return proxyBaseFromEnv().length > 0;
}

async function discoverProxyBase(): Promise<string> {
  for (const url of DISCOVERY_URLS) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as { base?: string };
      const base = normalizeBase(String(data.base || ""));
      if (/^https:\/\//i.test(base)) return base;
    } catch {
      /* try next */
    }
  }
  return "";
}

/** Resolve proxy base: env first (stable hosts), else published discovery JSON. */
export async function resolveProxyBase(): Promise<string> {
  const fromEnv = proxyBaseFromEnv();
  if (fromEnv) {
    // Prefer env, but fall back to discovery if the baked URL is dead (ephemeral tunnels).
    try {
      const res = await fetch(`${fromEnv}/health`, { cache: "no-store" });
      if (res.ok) return fromEnv;
    } catch {
      /* fall through */
    }
  }
  if (resolved) return resolved;
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

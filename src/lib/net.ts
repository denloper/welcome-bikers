export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) controller.abort(init.signal.reason);
  else init.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}

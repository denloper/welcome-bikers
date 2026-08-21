import type { Page, Route } from "@playwright/test";

/** Fulfill chat/completions-shaped JSON through the CORS proxy /chat path. */
export async function mockProxyChat(
  page: Page,
  handler: (route: Route, lastUserText: string) => Promise<void>,
) {
  await page.route(/\/chat\/?$/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors() });
      return;
    }
    const body = route.request().postDataJSON() as { messages?: { content?: string }[] };
    const last = body.messages?.[body.messages.length - 1]?.content || "";
    await handler(route, last);
  });
}

export async function mockProxySpeech(
  page: Page,
  onHit?: (body: Record<string, unknown>) => void,
) {
  await page.route(/\/speech\/?$/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors() });
      return;
    }
    const body = (route.request().postDataJSON() || {}) as Record<string, unknown>;
    onHit?.(body);
    const fakeMp3 = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    await route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      headers: cors(),
      body: fakeMp3,
    });
  });
}

export async function mockProxyTranscribe(
  page: Page,
  texts: string[] | string = "what bars are in Montenegro",
  onHit?: (body: Record<string, unknown>) => void,
) {
  const queue = Array.isArray(texts) ? [...texts] : [texts];
  let i = 0;
  await page.route(/\/transcribe\/?$/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors() });
      return;
    }
    const body = (route.request().postDataJSON() || {}) as Record<string, unknown>;
    onHit?.(body);
    const text = queue[Math.min(i, queue.length - 1)] || "";
    i += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors(),
      body: JSON.stringify({ text }),
    });
  });
}

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function fulfillChatJson(route: Route, payload: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: cors(),
    body: JSON.stringify({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  });
}

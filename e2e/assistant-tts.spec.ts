import { expect, test } from "@playwright/test";
import { fulfillChatJson, mockProxyChat, mockProxySpeech } from "./helpers/mockProxy";

test("Real Bro opens silently and only voices an actual reply", async ({ page }) => {
  let ttsHits = 0;
  let lastBody: Record<string, unknown> | null = null;

  await mockProxySpeech(page, (body) => {
    ttsHits += 1;
    lastBody = body;
  });

  await mockProxyChat(page, async (route) => {
    await fulfillChatJson(route, {
      reply: "Yeah bro, I am the Real Bro AI. Lets roll.",
      intent: "chat",
    });
  });

  await page.goto("/#/");
  await page.getByTestId("assistant-row").tap();
  await page.waitForTimeout(300);
  expect(ttsHits).toBe(0);
  await page.getByTestId("assistant-input").fill("hello are you ai?");
  await page.getByTestId("assistant-send").tap();
  await expect.poll(() => ttsHits, { timeout: 15_000 }).toBe(1);

  expect(lastBody?.model).toBeTruthy();
  expect(String(lastBody?.voice || "")).toMatch(/DeepVoice|odysseus|Charon|fenrir|apollo/i);
  expect(lastBody?.input).toBeTruthy();
});

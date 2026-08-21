import { expect, test } from "@playwright/test";
import { fulfillChatJson, mockProxyChat } from "./helpers/mockProxy";

test("OpenRouter Real Bro JSON normalizes ride and category intents", async ({ page }) => {
  await mockProxyChat(page, async (route, last) => {
    if (/beer|бар/i.test(last)) {
      await fulfillChatJson(route, {
        reply: "Beer run locked. Here are bikers bars in Montenegro.",
        intent: "category",
        type: "bars",
        country: "Montenegro",
      });
      return;
    }
    await fulfillChatJson(route, {
      reply: "Easy, bro — I build routes and drop place cards. Weather is for softies.",
      intent: "chat",
    });
  });

  await page.goto("/#/");
  await page.getByTestId("assistant-row").tap();
  await page.getByTestId("assistant-input").fill("where can I grab a beer in Montenegro?");
  await page.getByTestId("assistant-send").tap();
  const cards = page.locator('[data-testid="assistant-card"]');
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".rb-bubble.bro").last()).toContainText(/beer|bars/i);
});

import { expect, test } from "@playwright/test";

test("OpenRouter Real Bro JSON normalizes ride and category intents", async ({ page }) => {
  await page.route("https://openrouter.ai/api/v1/chat/completions", async (route) => {
    const body = route.request().postDataJSON() as { messages?: { content?: string }[] };
    const last = body.messages?.[body.messages.length - 1]?.content || "";
    if (/beer|бар/i.test(last)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Beer run locked. Here are bikers bars in Montenegro.",
                  intent: "category",
                  type: "bars",
                  country: "Montenegro",
                }),
              },
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "Easy, bro — I build routes and drop place cards. Weather is for softies.",
                intent: "chat",
              }),
            },
          },
        ],
      }),
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

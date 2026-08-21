import { expect, test } from "@playwright/test";

const live = process.env.LIVE_OPENROUTER === "1";

test.describe("Real Bro live OpenRouter", () => {
  test.skip(!live, "Set LIVE_OPENROUTER=1 to hit the real OpenRouter API (CI / non-RF runners).");

  test("answers a free-form hello with a unique AI reply, not the weather canned line", async ({ page }) => {
    const stamp = `ping-${Date.now()}`;
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await page.getByTestId("assistant-input").fill(`hello are you an AI? code ${stamp}`);
    await page.getByTestId("assistant-send").tap();

    const answer = page.locator(".rb-bubble.bro").last();
    await expect(answer).toBeVisible({ timeout: 45_000 });
    const text = (await answer.textContent()) || "";
    expect(text.length).toBeGreaterThan(12);
    expect(text).not.toMatch(/not your weather app/i);
    expect(text).toMatch(/ai|real bro|ride|route|bar|bro/i);
  });

  test("turns a natural beer question into Montenegro bar cards", async ({ page }) => {
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await page.getByTestId("assistant-input").fill("where can I grab a cold beer with bikers in Montenegro?");
    await page.getByTestId("assistant-send").tap();

    const cards = page.locator('[data-testid="assistant-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 45_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    const answer = (await page.locator(".rb-bubble.bro").last().textContent()) || "";
    expect(answer).not.toMatch(/not your weather app/i);
  });
});

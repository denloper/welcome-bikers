import { expect, test } from "@playwright/test";

test.describe("Real Bro assistant", () => {
  test("opens from the main page with a greeting and text input", async ({ page }) => {
    await page.goto("/#/");
    const row = page.getByTestId("assistant-row");
    await expect(row).toBeVisible();
    await expect(row).toContainText("AI assistant");
    await expect(row).toContainText("Real Bro");
    await row.tap();
    await expect(page.getByTestId("assistant-sheet")).toBeVisible();
    await expect(page.locator(".rb-bubble.bro").first()).toContainText(/Yo, bro/i);
    await expect(page.getByTestId("assistant-input")).toBeVisible();
  });

  test("answers in English with place cards and rides to one", async ({ page }) => {
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await page.getByTestId("assistant-input").fill("what bars are in Montenegro?");
    await page.getByTestId("assistant-send").tap();

    const cards = page.locator('[data-testid="assistant-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    const answer = page.locator(".rb-bubble.bro").last();
    await expect(answer).toContainText(/bikers bars/i);
    await expect(answer).toContainText(/Montenegro/i);
    await expect(answer).not.toContainText(/[а-яё]/i);

    const firstName = await cards.first().locator("b").textContent();
    await cards.first().getByTestId("assistant-ride").tap();
    await expect(page).toHaveURL(/\/#\/map\?to=[\d.-]+,[\d.-]+&name=/);
    expect(firstName?.length).toBeGreaterThan(0);
  });

  test("finds a known place from the base for a ride request", async ({ page }) => {
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await page.getByTestId("assistant-input").fill("ride to Magnus Moto");
    await page.getByTestId("assistant-input").press("Enter");
    const card = page.locator('[data-testid="assistant-card"]').first();
    await expect(card).toContainText("Magnus Moto", { timeout: 15_000 });
    await expect(card.getByTestId("assistant-ride")).toBeVisible();
  });

  test("answers unclear chat with OpenRouter Real Bro AI", async ({ page }) => {
    await page.route("https://openrouter.ai/api/v1/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'Weather? Bro, I am not AccuWeather. Say "ride to Podgorica" to build a route, or ask what bars are in Montenegro.',
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
    await page.getByTestId("assistant-input").fill("how is the weather?");
    await page.getByTestId("assistant-send").tap();
    await expect(page.locator(".rb-bubble.bro").last()).toContainText(/build a route/i, { timeout: 15_000 });
  });

  test("records in English and shows a live waveform", async ({ page }) => {
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = "";
        continuous = false;
        interimResults = false;
        maxAlternatives = 1;
        onresult = null;
        onerror = null;
        onend: (() => void) | null = null;
        start() {
          const w = window as unknown as {
            __recognitionLang?: string;
            __recognitionContinuous?: boolean;
            __recognitionInterim?: boolean;
          };
          w.__recognitionLang = this.lang;
          w.__recognitionContinuous = this.continuous;
          w.__recognitionInterim = this.interimResults;
        }
        stop() {
          this.onend?.();
        }
      }
      Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
    });
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await page.getByLabel("Voice input").tap();
    await expect(page.getByTestId("assistant-waveform")).toBeVisible();
    await expect(page.locator(".rb-state")).toHaveText("Listening…");
    expect(
      await page.evaluate(() => (window as unknown as { __recognitionLang?: string }).__recognitionLang),
    ).toBe("en-US");
    expect(
      await page.evaluate(() => (window as unknown as { __recognitionContinuous?: boolean }).__recognitionContinuous),
    ).toBe(true);
    expect(
      await page.evaluate(() => (window as unknown as { __recognitionInterim?: boolean }).__recognitionInterim),
    ).toBe(true);

    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator(".rb-state")).toHaveText("Listening…");
  });
});

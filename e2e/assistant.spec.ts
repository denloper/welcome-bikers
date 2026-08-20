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

  test("answers a category question with place cards and rides to one", async ({ page }) => {
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await page.getByTestId("assistant-input").fill("какие бары есть в Черногории");
    await page.getByTestId("assistant-send").tap();

    const cards = page.locator('[data-testid="assistant-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator(".rb-bubble.bro").last()).toContainText(/бар/i);
    await expect(page.locator(".rb-bubble.bro").last()).toContainText(/Черногории/i);

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

  test("explains what it can do on an unclear request", async ({ page }) => {
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await page.getByTestId("assistant-input").fill("привет как дела");
    await page.getByTestId("assistant-send").tap();
    await expect(page.locator(".rb-bubble.bro").last()).toContainText(/маршрут/i, { timeout: 15_000 });
  });
});

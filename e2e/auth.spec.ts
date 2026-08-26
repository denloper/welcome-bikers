import { expect, test } from "@playwright/test";

test("local profile keeps its verifier through profile updates and rejects a wrong password", async ({ page }) => {
  await page.goto("/#/register");
  await page.getByRole("button", { name: "START" }).click();
  const fields = page.locator(".auth-form input");
  await fields.nth(0).fill("Road Tester");
  await fields.nth(1).fill("road@example.com");
  await fields.nth(2).fill("correct-horse");
  await page.getByRole("button", { name: "Create an account" }).click();

  await expect(page).toHaveURL(/#\/account$/);
  const credential = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("wb.v2") || "{}");
    return state.users?.[0];
  });
  expect(credential.password).toBeUndefined();
  expect(credential.passwordHash).toBeTruthy();
  expect(credential.passwordSalt).toBeTruthy();

  await page.getByRole("button", { name: "Mark as verified locally" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.goto("/#/login");

  const login = page.locator(".auth-form input");
  await login.nth(0).fill("road@example.com");
  await login.nth(1).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".auth-form")).toContainText("Wrong email or password");

  await login.nth(1).fill("correct-horse");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/#\/account$/);
});

test("legacy plaintext credential migrates only after a successful login", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "wb.v2",
      JSON.stringify({
        user: null,
        users: [{
          id: "legacy-user",
          name: "Legacy Rider",
          email: "legacy@example.com",
          emailVerified: false,
          friends: [],
          password: "legacy-pass",
        }],
      }),
    );
  });
  await page.goto("/#/login");
  const fields = page.locator(".auth-form input");
  await fields.nth(0).fill("legacy@example.com");
  await fields.nth(1).fill("legacy-pass");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/#\/account$/);

  const credential = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("wb.v2") || "{}");
    return state.users?.[0];
  });
  expect(credential.password).toBeUndefined();
  expect(credential.passwordHash).toBeTruthy();
  expect(credential.passwordSalt).toBeTruthy();
});

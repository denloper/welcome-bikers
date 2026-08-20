import { expect, test, type Page } from "@playwright/test";

const START = { latitude: 42.441, longitude: 19.2626 };
const DEST = { lat: 42.43, lon: 19.28 };

const OSRM = {
  code: "Ok",
  routes: [
    {
      distance: 2400,
      duration: 360,
      geometry: {
        coordinates: [
          [START.longitude, START.latitude],
          [19.271, 42.436],
          [DEST.lon, DEST.lat],
        ],
      },
      legs: [
        {
          steps: [
            {
              name: "Bulevar",
              distance: 1400,
              duration: 200,
              maneuver: { type: "depart", modifier: "straight", location: [START.longitude, START.latitude] },
            },
            {
              name: "Destination",
              distance: 1000,
              duration: 160,
              maneuver: { type: "arrive", modifier: "right", location: [DEST.lon, DEST.lat] },
            },
          ],
        },
      ],
    },
  ],
};

async function expectMapVisible(page: Page) {
  await expect(page.locator(".map-gl")).toHaveAttribute("data-ready", "1", { timeout: 20_000 });
  await expect(page.locator(".map-gl .gm-style").or(page.locator(".map-gl canvas")).first()).toBeVisible();
}

async function mockRouting(page: Page) {
  await page.route(/valhalla1\.openstreetmap\.de/, (route) =>
    route.fulfill({ status: 500, body: "no" }),
  );
  await page.route(/\/route\/v1\/driving\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(OSRM),
    }),
  );
}

test.describe("GO navigation", () => {
  test("browse map stays visible with a canvas", async ({ page }) => {
    await page.goto("/#/map");
    await expectMapVisible(page);
    await expect(page.locator(".map-page.is-nav")).toHaveCount(0);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-pitch", "0");
  });

  test("dark theme reloads the map style and keeps the canvas", async ({ page }) => {
    await page.goto("/#/map");
    await expectMapVisible(page);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-kind", "vector-light");
    await page.getByTestId("map-theme").evaluate((btn) => (btn as HTMLButtonElement).click());
    await expect(page.locator(".map-page.is-dark")).toBeVisible();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-kind", "vector-dark", { timeout: 20_000 });
    await expectMapVisible(page);
    const box = await page.locator(".map-gl").boundingBox();
    expect(box && box.width > 100 && box.height > 100).toBeTruthy();
    const searchBg = await page.locator(".map-q").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(searchBg.replace(/\s/g, "")).toBe("rgb(255,255,255)");
  });

  test("opens on a Europe overview, not a Montenegro close-up", async ({ page }) => {
    await page.goto("/#/map");
    await expectMapVisible(page);
    const zoom = Number(await page.locator(".map-gl").getAttribute("data-zoom"));
    expect(zoom).toBeGreaterThan(3);
    expect(zoom).toBeLessThanOrEqual(6.5);
  });

  test("uses a 45-degree 3D camera like the original, with side tools", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);

    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Test%20Place`);
    await expect(page.locator(".route-go")).toBeEnabled();

    await page.locator(".route-go").click();
    await expect(page.locator(".map-page.is-nav")).toBeVisible();
    await expect(page.locator(".map-gl")).toBeVisible();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-pitch", "45");
    await expectMapVisible(page);
    await expect(page.locator(".nav-hud")).toBeVisible();
    await expect(page.locator(".nav-exit")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toHaveCount(0);

    await expect(page.locator(".nav-hud-time")).not.toHaveText("Now");
    await expect(page.locator(".nav-hud-km")).not.toHaveText("0 m");

    await expect(page.getByLabel("filters")).toBeVisible();
    await expect(page.getByLabel("map theme")).toBeVisible();
    await expect(page.getByLabel("Zoom in")).toBeVisible();
    await expect(page.getByLabel("My location")).toBeVisible();

    await expect(page.locator(".map-gl")).toHaveAttribute("data-ready", "1", { timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(await page.locator(".map-gl").getAttribute("data-pitch")).toBe("45");
    const box = await page.locator(".map-gl").boundingBox();
    expect(box && box.width > 100 && box.height > 100).toBeTruthy();
    await page.screenshot({ path: "test-results/go-nav.png", fullPage: true });

    await page.getByTestId("nav-exit").evaluate((btn) => (btn as HTMLButtonElement).click());
    await expect(page.locator(".map-page.is-nav")).toHaveCount(0);
    await expect(page.locator(".map-page")).toBeVisible();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-pitch", "0");
    await expectMapVisible(page);
    await expect(page.locator(".route-go")).toBeEnabled();

    await page.screenshot({ path: "test-results/go-exit.png", fullPage: true });
  });

  test("does not start GO when GPS is already at the destination", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: DEST.lat, longitude: DEST.lon });
    await mockRouting(page);

    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Test%20Place`);
    await expect(page.getByText(/already there/i)).toBeVisible();
    await expect(page.locator(".route-go")).toHaveCount(0);
    await expect(page.locator(".nav-hud")).toHaveCount(0);
  });

  test("tapping My current location refreshes the GPS start", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);
    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Test%20Place`);
    await expect(page.locator(".route-go")).toBeEnabled();
    await page.locator('[data-stop="start"]').click();
    await expect(page.locator('[data-stop="start"]')).toContainText(/Locating|Tap to change|Tap the map/i);
    await expect(page.locator(".route-go")).toBeEnabled();
  });

  test("a multi-stop trip starts from current GPS, not the first waypoint", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);
    await page.goto(`/#/map?via=42.11,19.25|42.44,19.27&name=Podgorica`);
    await expect(page.locator('[data-stop="start"]')).toContainText(/My current location/i);
    await expect(page.locator(".route-go")).toBeEnabled();
  });

  test("Add waypoint picks a point on the map", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);
    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Test%20Place`);
    await expect(page.locator(".route-go")).toBeEnabled();
    await expectMapVisible(page);
    await page.locator(".route-add").click();
    await expect(page.locator(".map-page.is-pick")).toBeVisible();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-pick", "1");
    await page.evaluate(() => {
      const el = document.querySelector(".map-gl") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width * 0.4;
      const y = r.top + r.height * 0.45;
      const opts: PointerEventInit = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "touch",
      };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
    });
    await expect(page.getByText(/1 stop/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".map-page.is-pick")).toHaveCount(0);
  });
});

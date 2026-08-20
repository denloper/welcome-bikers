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
    await expect(page.locator(".map-gl canvas")).toBeVisible();
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
    await page.waitForTimeout(2500);
    const pitch = await page.locator(".map-gl").getAttribute("data-pitch");
    expect(pitch).toBe("45");

    await page.screenshot({ path: "test-results/go-nav.png", fullPage: true });
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
});

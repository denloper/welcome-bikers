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
  test("keeps a north-up map, right-side tools, and remaining distance", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);

    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Test%20Place`);
    await expect(page.locator(".route-go")).toBeEnabled();

    await page.locator(".route-go").click();
    await expect(page.locator(".map-page.is-nav")).toBeVisible();
    await expect(page.locator(".nav-hud")).toBeVisible();
    await expect(page.locator(".nav-exit")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toHaveCount(0);

    await expect(page.locator(".nav-hud-time")).not.toHaveText("Now");
    await expect(page.locator(".nav-hud-km")).not.toHaveText("0 m");

    await expect(page.getByLabel("filters")).toBeVisible();
    await expect(page.getByLabel("map theme")).toBeVisible();
    await expect(page.getByLabel("Zoom in")).toBeVisible();
    await expect(page.getByLabel("My location")).toBeVisible();

    const geo = await page.evaluate(() => {
      const stage = document.querySelector(".map-nav-stage") as HTMLElement;
      const pageEl = document.querySelector(".map-page") as HTMLElement;
      const t = getComputedStyle(stage).transform;
      return {
        t,
        k: stage.offsetWidth / Math.max(1, pageEl.offsetWidth),
        rotated: t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)",
      };
    });
    expect(geo.k).toBeLessThan(1.05);
    expect(geo.rotated).toBe(false);

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

  test("My current location can pick a new start on the map", async ({ page }) => {
    await mockRouting(page);
    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Test%20Place`);
    await expect(page.locator('[data-stop="start"]')).toBeVisible();
    await page.locator('[data-stop="start"]').click();
    await expect(page.getByText(/tap the map/i)).toBeVisible();

    const box = await page.locator(".map-page").boundingBox();
    if (!box) throw new Error("no map");
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.42);
    await expect(page.locator(".route-go")).toBeEnabled({ timeout: 20_000 });
  });
});

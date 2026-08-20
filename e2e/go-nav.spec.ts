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
              distance: 600,
              duration: 90,
              maneuver: { type: "depart", modifier: "straight", location: [START.longitude, START.latitude] },
            },
            {
              name: "Bridge",
              distance: 800,
              duration: 110,
              maneuver: { type: "turn", modifier: "left", location: [19.271, 42.436] },
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
    {
      distance: 2700,
      duration: 410,
      geometry: {
        coordinates: [
          [START.longitude, START.latitude],
          [19.268, 42.439],
          [19.275, 42.433],
          [DEST.lon, DEST.lat],
        ],
      },
      legs: [
        {
          steps: [
            {
              name: "Alternative road",
              distance: 1700,
              duration: 250,
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
    await page.getByTestId("map-theme").tap();
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
    await expect(page.locator(".map-gl")).toHaveAttribute("data-nav-entry", "flat-to-3d");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-pitch", "45");
    await expect.poll(async () => Number(await page.locator(".map-gl").getAttribute("data-zoom") || "0")).toBeGreaterThanOrEqual(17.5);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-follow", "on");
    await expectMapVisible(page);
    await expect(page.locator(".nav-hud")).toBeVisible();
    await expect(page.locator(".nav-exit")).toBeVisible();
    await expect(page.locator(".nav-banner b")).not.toHaveText("0 m");
    await expect(page.locator(".nav-next-list")).toBeVisible();
    await expect(page.locator(".bottom-nav")).toHaveCount(0);

    await expect(page.locator(".nav-hud-time")).not.toHaveText("Now");
    await expect(page.locator(".nav-hud-km")).not.toHaveText("0 m");

    await expect(page.getByLabel("filters")).toBeVisible();
    await expect(page.getByLabel("map theme")).toBeVisible();
    await expect(page.getByLabel("Zoom in")).toBeVisible();
    await expect(page.getByLabel("My location")).toBeVisible();
    await expect(page.getByLabel("Build route")).toHaveCount(0);
    await expect(page.locator(".wb-me-star")).toHaveCount(0);

    await page.getByLabel("Zoom in").tap();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-follow", "paused");
    await page.getByLabel("My location").tap();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-follow", "on");

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
    await expect(page.getByLabel("Route profile")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fastest" })).toHaveClass(/on/);
    await expect(page.getByRole("button", { name: "Traffic", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ferries", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Paved roads", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "No highways" }).tap();
    await expect(page.getByRole("button", { name: "No highways" })).toHaveClass(/on/);
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
    await page.locator(".route-add").tap();
    await expect(page.locator(".map-page.is-pick")).toBeVisible();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-pick", "1");
    const hit = page.locator(".map-hit");
    await expect(hit).toBeVisible();
    const box = await hit.boundingBox();
    expect(box && box.width > 100 && box.height > 100).toBeTruthy();
    await hit.tap({
      position: { x: Math.round((box?.width || 320) * 0.4), y: Math.round((box?.height || 640) * 0.38) },
    });
    await expect(page.getByText(/1 stop/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".map-page.is-pick")).toHaveCount(0);
  });

  test("Build route sheet replaces Map/Satellite layers", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);
    await page.goto("/#/map");
    await expectMapVisible(page);

    await expect(page.getByLabel("layers")).toHaveCount(0);
    await expect(page.getByLabel("Map type")).toHaveCount(0);
    await expect(page.getByText("Satellite", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Build route")).toBeVisible();

    await page.getByLabel("Build route").tap();
    await expect(page.locator(".build-sheet")).toBeVisible();
    await expect(page.locator(".build-sheet-top h3")).toHaveText("Build route");
    await expect(page.locator(".build-sheet-top p")).toHaveText("Tap map or place");
    await expect(page.getByText("My current location")).toBeVisible();
    await expect(page.getByText("Tap a place or press on map")).toBeVisible();
    await expect(page.locator(".build-go")).toBeDisabled();
    await expect(page.locator(".map-page.is-pick")).toBeVisible();

    const hit = page.locator(".map-hit");
    await expect(hit).toBeVisible();
    const box = await hit.boundingBox();
    expect(box && box.width > 100 && box.height > 100).toBeTruthy();
    await hit.tap({
      position: { x: Math.round((box?.width || 320) * 0.4), y: Math.round((box?.height || 640) * 0.32) },
    });
    await expect(page.locator(".build-go")).toBeEnabled({ timeout: 10_000 });
    await page.locator(".build-go").tap();
    await expect(page.locator(".build-sheet")).toHaveCount(0);
    await expect(page.locator(".route-go")).toBeEnabled({ timeout: 15_000 });
  });

  test("my location shows a blue star when not in GO", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await page.goto("/#/map");
    await expectMapVisible(page);
    await page.getByLabel("My location").tap();
    await expect(page.locator(".wb-me-star")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".wb-garrow")).toHaveCount(0);
  });

  test("map chrome responds to a finger tap", async ({ page }) => {
    await page.goto("/#/map");
    await expectMapVisible(page);
    await page.getByLabel("Zoom in").tap();
    await page.getByLabel("filters").tap();
    await expect(page.locator(".country-sheet.map-overlay")).toBeVisible();
    await page.locator(".backdrop.map-overlay").click();
    await expect(page.locator(".country-sheet.map-overlay")).toHaveCount(0);
  });

  test("clusters and pins accept a finger tap", async ({ page }) => {
    await page.goto("/#/map");
    await expectMapVisible(page);
    const target = page.locator(".wb-gcluster, .wb-gpin-hit").first();
    await expect(target).toBeVisible({ timeout: 20_000 });
    const beforeZoom = await page.locator(".map-gl").getAttribute("data-zoom");
    await target.tap();
    await expect
      .poll(async () => {
        if ((await page.locator(".map-place").count()) > 0) return "place";
        return page.locator(".map-gl").getAttribute("data-zoom");
      })
      .not.toBe(beforeZoom);
  });

  test("falls back to MapLibre and offers route alternatives when Google is unavailable", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await page.route(/maps\.googleapis\.com/, (route) => route.abort());
    await mockRouting(page);

    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Fallback`);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-engine", "libre", { timeout: 25_000 });
    await expect(page.locator(".route-go")).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByLabel("Route alternatives")).toBeVisible();
    await expect(page.getByLabel("Route alternatives").getByRole("button")).toHaveCount(2);
    await page.getByLabel("Route alternatives").getByRole("button").nth(1).tap();
    await expect(page.getByLabel("Route alternatives").getByRole("button").nth(1)).toHaveClass(/on/);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-traffic", "unavailable");
  });

  test("cycles Light, Dark, and Auto map themes", async ({ page }) => {
    await page.goto("/#/map");
    await expectMapVisible(page);
    const theme = page.getByTestId("map-theme");
    await expect(theme).toHaveAttribute("data-theme-mode", "light");
    await theme.tap();
    await expect(theme).toHaveAttribute("data-theme-mode", "dark");
    await theme.tap();
    await expect(theme).toHaveAttribute("data-theme-mode", "auto");
    await theme.tap();
    await expect(theme).toHaveAttribute("data-theme-mode", "light");
  });

  test("keeps the PWA shell readable when the connection drops", async ({ page, context }) => {
    await page.goto("/#/map");
    await expectMapVisible(page);
    await context.setOffline(true);
    await expect(page.locator(".map-offline")).toContainText(/internet connection/i);
    await expect(page.locator(".map-page")).toBeVisible();
    await context.setOffline(false);
    await expect(page.locator(".map-offline")).toHaveCount(0);
  });

  test("publishes an installable web app manifest", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toBe("Welcome Bikers");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});

import { devices, expect, test, type Page } from "@playwright/test";

const START = { latitude: 42.441, longitude: 19.2626 };
const DEST = { lat: 42.43, lon: 19.28 };
const { defaultBrowserType: _iphoneBrowser, ...IPHONE_13 } = devices["iPhone 13"];

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
    await expect(page.locator(".map-gl")).toHaveAttribute("data-traffic", "off");
    await expect(page.locator(".maplibregl-ctrl-attrib:visible, .gm-style-cc:visible").first()).toBeVisible();
  });

  test("dark theme reloads the map style and keeps the canvas", async ({ page }) => {
    await page.goto("/#/map");
    await expectMapVisible(page);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-kind", "vector-light");
    await page.getByTestId("map-theme").tap();
    await expect(page.locator(".map-page.is-dark")).toBeVisible();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-kind", "vector-dark", { timeout: 20_000 });
    await expectMapVisible(page);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-traffic", "off");
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

  test("uses the redesigned 50-degree GO camera, HUD, and branded tracker", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);

    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Test%20Place`);
    await expect(page.locator(".route-go")).toBeEnabled();

    await page.locator(".route-go").click();
    await expect(page.locator(".map-page.is-nav")).toBeVisible();
    await expect(page.locator(".map-gl")).toBeVisible();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-nav-entry", "flat-to-3d");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-pitch", "50");
    await expect.poll(async () => Number(await page.locator(".map-gl").getAttribute("data-zoom") || "0")).toBeGreaterThanOrEqual(17.5);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-follow", "on");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-camera-offset", "ahead");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-route-progress", /^[01]\.\d{3}$/);
    await expectMapVisible(page);
    await expect(page.locator(".nav-hud")).toBeVisible();
    await expect(page.locator(".nav-exit")).toBeVisible();
    await expect(page.locator(".nav-banner b")).not.toHaveText("0 m");
    await expect(page.locator(".nav-next-list")).toBeVisible();
    await expect(page.locator('.nav-maneuver-icon[data-maneuver="left"]').first()).toBeVisible();
    await expect(page.locator(".bottom-nav")).toHaveCount(0);

    await expect(page.locator(".nav-hud-time")).not.toHaveText("Now");
    await expect(page.locator(".nav-hud-km")).not.toHaveText("0 m");

    await expect(page.locator(".map-tools")).toHaveCount(0);
    await expect(page.getByTestId("nav-mute")).toBeVisible();
    await expect(page.getByTestId("nav-recenter")).toBeVisible();
    await expect(page.getByLabel("Build route")).toHaveCount(0);
    await expect(page.locator(".wb-me-star")).toHaveCount(0);
    const navPuck = page.locator(".wb-nav-puck");
    await expect(navPuck).toBeVisible();
    await expect(navPuck).toHaveAttribute("data-design", "wide-blue-star");
    await expect(navPuck).toHaveCSS("width", "54px");
    await expect(navPuck).toHaveCSS("height", "54px");
    await expect(navPuck.locator("svg")).toHaveAttribute("viewBox", "0 0 64 64");
    await expect(navPuck.locator(".wb-puck-core")).toHaveAttribute("fill", "url(#wb-nav-gradient)");
    await expect(navPuck.locator(".wb-puck-star")).toHaveCSS("fill", "rgb(255, 255, 255)");

    await page.getByTestId("nav-mute").tap();
    await expect(page.getByTestId("nav-mute")).toHaveAttribute("aria-pressed", "true");

    const mapBox = await page.locator(".map-gl").boundingBox();
    expect(mapBox).toBeTruthy();
    await page.mouse.move((mapBox?.x || 0) + (mapBox?.width || 390) / 2, (mapBox?.y || 0) + 420);
    await page.mouse.down();
    await page.mouse.move((mapBox?.x || 0) + (mapBox?.width || 390) / 2 + 70, (mapBox?.y || 0) + 420, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-follow", "paused");
    await expect(page.getByText(/Free look/i)).toBeVisible();
    await page.getByTestId("nav-recenter").tap();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-follow", "on");

    await expect(page.locator(".map-gl")).toHaveAttribute("data-ready", "1", { timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(await page.locator(".map-gl").getAttribute("data-pitch")).toBe("50");
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

  test("does not re-enable GO chrome after leaving during a delayed GPS read", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);
    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Delayed%20GPS`);
    await expect(page.locator(".route-go")).toBeEnabled();
    await page.evaluate(() => {
      const geolocation = navigator.geolocation;
      const original = geolocation.getCurrentPosition.bind(geolocation);
      Object.defineProperty(geolocation, "getCurrentPosition", {
        configurable: true,
        value(
          success: PositionCallback,
          error?: PositionErrorCallback | null,
          options?: PositionOptions,
        ) {
          window.setTimeout(() => {
            (window as typeof window & { __geoDelayDone?: boolean }).__geoDelayDone = true;
            original(success, error, options);
          }, 700);
        },
      });
    });

    await page.locator(".route-go").click();
    await expect(page.locator(".map-page.is-nav")).toBeVisible();
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(page.locator(".map-page")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => Boolean((window as typeof window & { __geoDelayDone?: boolean }).__geoDelayDone)))
      .toBe(true);
    await expect(page.locator("body")).not.toHaveClass(/wb-nav-go/);
    await expect(page.locator(".app")).not.toHaveClass(/no-nav/);
  });

  test("keeps the redesigned GO HUD legible in dark mode", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);
    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Dark%20Route`);
    await page.getByTestId("map-theme").tap();
    await expect(page.getByTestId("map-theme")).toHaveAttribute("data-theme-mode", "dark");
    await expect(page.locator(".route-go")).toBeEnabled();
    await page.locator(".route-go").tap();

    await expect(page.locator(".map-page.is-nav.is-dark")).toBeVisible();
    await expect(page.getByTestId("nav-primary")).toBeVisible();
    await expect(page.getByTestId("nav-mute")).toBeVisible();
    await expect(page.locator(".wb-nav-puck")).toBeVisible();
    await expect(page.locator(".nav-ui")).toHaveCSS("color", "rgb(248, 250, 252)");
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

  test("invalidates GO while route options are being replanned", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await page.route(/valhalla1\.openstreetmap\.de/, (route) => route.fulfill({ status: 500, body: "no" }));
    let osrmHits = 0;
    await page.route(/\/route\/v1\/driving\//, async (route) => {
      osrmHits += 1;
      if (osrmHits > 1) await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(OSRM) });
    });

    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=Replan%20Test`);
    await expect(page.locator(".route-go")).toBeEnabled();
    await page.getByRole("button", { name: "No highways" }).click();

    await expect(page.locator(".map-page")).toHaveAttribute("data-route-planning", "1");
    await expect(page.locator(".route-go")).toHaveCount(0);
    await expect(page.locator(".map-page")).toHaveAttribute("data-route-planning", "0");
    await expect(page.locator(".route-go")).toBeEnabled();
  });

  test("waits for GPS instead of placing the rider at the route origin", async ({ page }) => {
    await page.addInitScript(() => {
      const denied = { code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) => fail?.(denied),
          watchPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) => {
            queueMicrotask(() => fail?.(denied));
            return 1;
          },
          clearWatch: () => undefined,
        },
      });
    });
    await mockRouting(page);
    const via = `${START.latitude},${START.longitude}|${DEST.lat},${DEST.lon}`;
    await page.goto(`/#/map?via=${encodeURIComponent(via)}&name=No%20GPS`);
    await expect(page.locator(".route-go")).toBeEnabled();
    await page.locator(".route-go").click();

    await expect(page.locator(".nav-ui")).toHaveAttribute("data-route-state", "gps-wait");
    await expect(page.locator(".nav-status")).toContainText("Waiting for a reliable GPS fix");
    await expect(page.locator(".wb-nav-puck")).toHaveCount(0);
    await expect(page.getByTestId("nav-exit")).toBeVisible();
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
    await expect(page.locator(".map-gl")).toHaveAttribute("data-traffic", /on|unavailable/);
    await expect(page.getByRole("button", { name: "Ferries", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Paved roads", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Traffic", exact: true }).tap();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-traffic", "off");
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
    await expect(page.locator(".map-gl")).toHaveAttribute("data-place-markers", "hidden");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-route-stops", "3");
    await expect(page.locator(".wb-route-map-stop")).toHaveCount(3);
    await expect(page.locator('.wb-route-map-stop[data-stop-role="start"]')).toHaveCount(1);
    await expect(page.locator('.wb-route-map-stop[data-stop-role="via"]')).toHaveCount(1);
    await expect(page.locator('.wb-route-map-stop[data-stop-role="end"]')).toHaveCount(1);
    await expect(page.locator(".wb-gpin-hit, .wb-gcluster, .wb-me-star")).toHaveCount(0);
    await page.locator(".route-go").tap();
    await expect(page.locator(".map-page.is-nav")).toBeVisible();
    await expect(page.locator(".wb-route-map-stop")).toHaveCount(0);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-route-stops", "0");
  });

  test("MapLibre multi-stop preview shows only its numbered Stops", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await page.route(/maps\.googleapis\.com/, (route) => route.abort());
    await mockRouting(page);

    await page.goto(`/#/map?via=42.11,19.25|42.44,19.27&name=Podgorica`);
    await expect(page.locator(".map-gl")).toHaveAttribute("data-engine", "libre", { timeout: 25_000 });
    await expect(page.locator(".map-gl")).toHaveAttribute("data-place-markers", "hidden");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-route-stops", "3");
    const routeStops = page.locator(".wb-route-map-stop");
    await expect(routeStops).toHaveCount(3);
    await expect(routeStops.nth(0)).toHaveText("1");
    await expect(routeStops.nth(1)).toHaveText("2");
    await expect(routeStops.nth(2)).toHaveText("3");
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
    await page.locator(".route-go").click();
    await expect(page.locator(".map-page.is-nav")).toBeVisible();
    await expect(page.locator(".map-gl")).toHaveAttribute("data-engine", "libre");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-pitch", "50");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-camera-offset", "ahead");
    await expect(page.locator(".map-gl")).toHaveAttribute("data-route-progress", /^[01]\.\d{3}$/);
    await expect(page.locator(".wb-nav-puck")).toBeVisible();
    await expect(page.getByTestId("nav-recenter")).toBeVisible();
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

test.describe("iPhone GO layout", () => {
  test.use(IPHONE_13);

  test("keeps the full HUD touchable inside mobile safe bounds", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(START);
    await mockRouting(page);
    await page.goto(`/#/map?to=${DEST.lat},${DEST.lon}&name=iPhone%20Route`);
    await expect(page.locator(".route-go")).toBeEnabled();
    await page.locator(".route-go").tap();

    const top = page.locator(".nav-top-stack");
    const bottom = page.locator(".nav-hud");
    await expect(top).toBeVisible();
    await expect(bottom).toBeVisible();
    await expect
      .poll(async () => {
        const viewport = page.viewportSize();
        const topBox = await top.boundingBox();
        const bottomBox = await bottom.boundingBox();
        return Boolean(
          viewport &&
            topBox &&
            bottomBox &&
            topBox.y >= 0 &&
            bottomBox.y + bottomBox.height <= viewport.height + 1,
        );
      })
      .toBe(true);

    for (const id of ["nav-mute", "nav-recenter", "nav-exit"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box && box.height >= 44 && box.width >= 44).toBeTruthy();
    }
    await page.getByTestId("nav-mute").tap();
    await expect(page.getByTestId("nav-mute")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("nav-exit").tap();
    await expect(page.locator(".map-page.is-nav")).toHaveCount(0);
  });
});

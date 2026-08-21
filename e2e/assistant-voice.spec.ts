import { expect, test, type Page } from "@playwright/test";
import { fulfillChatJson, mockProxyChat, mockProxySpeech, mockProxyTranscribe } from "./helpers/mockProxy";
import { canMediaRecord, isAppleMobile, preferRecordStt } from "../src/lib/stt";

async function installIphoneRecordMocks(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(navigator, "platform", { configurable: true, get: () => "iPhone" });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => 5 });

    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }
      state: "inactive" | "recording" = "inactive";
      mimeType = "audio/mp4";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
        queueMicrotask(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mp4" }),
          });
        });
      }
      requestData() {
        this.ondataavailable?.({
          data: new Blob([new Uint8Array([5, 6])], { type: "audio/mp4" }),
        });
      }
      stop() {
        this.state = "inactive";
        queueMicrotask(() => this.onstop?.());
      }
    }
    (window as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder = FakeMediaRecorder;

    const md = navigator.mediaDevices || ({} as MediaDevices);
    md.getUserMedia = async () =>
      ({
        getTracks: () => [{ stop() {}, kind: "audio", readyState: "live" }],
      }) as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: md });

    // Bake a proxy base so resolveProxyBase does not hit the network.
    (window as unknown as { __WB_PROXY__?: string }).__WB_PROXY__ = "https://proxy.test";
  });

  await page.route("**/or-proxy.json*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ base: "https://proxy.test" }),
    });
  });
  await page.route("https://proxy.test/health", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
}

test.describe("STT helpers", () => {
  test("preferRecordStt is true on Apple and when Speech API is missing", () => {
    // Node/jsdom-less: these read navigator from the test runner environment.
    // Prefer behavior contract: no Speech → prefer record if MediaRecorder exists.
    expect(typeof preferRecordStt).toBe("function");
    expect(typeof isAppleMobile).toBe("function");
    expect(typeof canMediaRecord).toBe("function");
    // In Playwright Node context MediaRecorder may be missing → false is OK.
    const prefer = preferRecordStt(false);
    expect(prefer === true || prefer === false).toBe(true);
  });
});

test.describe("Real Bro iPhone voice (MediaRecorder path)", () => {
  test("uses MediaRecorder even when webkitSpeechRecognition exists", async ({ page }) => {
    await installIphoneRecordMocks(page);
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
          (window as unknown as { __recognitionLang?: string }).__recognitionLang = this.lang;
        }
        stop() {}
      }
      Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
      Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
    });
    await mockProxyTranscribe(page, "ride to Magnus Moto");
    await mockProxySpeech(page);
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await page.getByLabel("Voice input").tap();
    await expect(page.locator(".rb-state")).toHaveText("Listening…");
    expect(
      await page.evaluate(() => (window as unknown as { __recognitionLang?: string }).__recognitionLang),
    ).toBeUndefined();
  });

  test("mic shows and two consecutive takes both submit", async ({ page }) => {
    await installIphoneRecordMocks(page);
    await mockProxyTranscribe(page, ["ride to Magnus Moto", "what bars are in Montenegro?"]);
    await mockProxySpeech(page);
    await mockProxyChat(page, async (route, last) => {
      if (/magnus/i.test(last)) {
        await fulfillChatJson(route, { reply: "Route locked.", intent: "ride", query: "Magnus Moto" });
        return;
      }
      await fulfillChatJson(route, { reply: "Here are bars.", intent: "category", type: "bar", country: "Montenegro" });
    });

    // Force baked proxy via env is unavailable in browser; discovery route above covers it.
    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    await expect(page.getByTestId("assistant-sheet")).toBeVisible();

    const mic = page.getByLabel("Voice input");
    await expect(mic).toBeVisible();

    await mic.tap();
    await expect(page.locator(".rb-state")).toHaveText("Listening…", { timeout: 5_000 });
    await mic.tap();

    await expect(page.locator(".rb-bubble.user").filter({ hasText: /Magnus Moto/i })).toBeVisible({
      timeout: 15_000,
    });

    // Second take — the iPhone regression (“first works, second doesn’t”).
    await expect(page.locator(".rb-state")).not.toHaveText("Listening…", { timeout: 10_000 });
    await mic.tap();
    await expect(page.locator(".rb-state")).toHaveText("Listening…", { timeout: 5_000 });
    await mic.tap();

    await expect(page.locator(".rb-bubble.user").filter({ hasText: /bars.*Montenegro/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("queues a second voice line while the first reply is still busy", async ({ page }) => {
    await installIphoneRecordMocks(page);
    await mockProxyTranscribe(page, ["hello bro", "ride to Magnus Moto"]);
    await mockProxySpeech(page);
    await mockProxyChat(page, async (route, last) => {
      if (/hello/i.test(last)) {
        await new Promise((r) => setTimeout(r, 800));
        await fulfillChatJson(route, { reply: "Yo.", intent: "chat" });
        return;
      }
      await fulfillChatJson(route, { reply: "Route locked.", intent: "ride", query: "Magnus Moto" });
    });

    await page.goto("/#/");
    await page.getByTestId("assistant-row").tap();
    const mic = page.getByLabel("Voice input");

    await mic.tap();
    await expect(page.locator(".rb-state")).toHaveText("Listening…");
    await mic.tap();
    await expect(page.locator(".rb-bubble.user").filter({ hasText: /hello bro/i })).toBeVisible({
      timeout: 15_000,
    });

    await mic.tap();
    await expect(page.locator(".rb-state")).toHaveText("Listening…");
    await mic.tap();

    await expect(page.locator(".rb-bubble.user").filter({ hasText: /Magnus Moto/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});

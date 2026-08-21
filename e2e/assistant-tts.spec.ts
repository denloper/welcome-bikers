import { expect, test } from "@playwright/test";

test("Real Bro neural TTS requests a deep male OpenRouter voice", async ({ page }) => {
  let ttsHits = 0;
  let lastBody: Record<string, unknown> | null = null;

  await page.route("https://openrouter.ai/api/v1/audio/speech", async (route) => {
    ttsHits += 1;
    lastBody = route.request().postDataJSON() as Record<string, unknown>;
    // Minimal valid-ish mp3 frame so Audio can load without exploding tests.
    const fakeMp3 = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    await route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      body: fakeMp3,
    });
  });

  // Chat path still mocked so we don't need live LLM here.
  await page.route("https://openrouter.ai/api/v1/chat/completions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "Yeah bro, I am the Real Bro AI. Lets roll.",
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
  // Greeting also speaks — wait for first TTS.
  await expect.poll(() => ttsHits, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByTestId("assistant-input").fill("hello are you ai?");
  await page.getByTestId("assistant-send").tap();
  await expect.poll(() => ttsHits, { timeout: 15_000 }).toBeGreaterThan(1);

  expect(lastBody?.model).toBeTruthy();
  expect(String(lastBody?.voice || "")).toMatch(/DeepVoice|odysseus|Charon|fenrir|apollo/i);
  expect(lastBody?.input).toBeTruthy();
});

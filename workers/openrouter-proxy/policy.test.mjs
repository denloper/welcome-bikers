import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedOrigins,
  checkRateLimit,
  endpointFor,
  isAllowedOrigin,
  sanitizeBody,
} from "./policy.mjs";

const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const decode = (value) => JSON.parse(new TextDecoder().decode(value));

test("origin policy is explicit and configurable", () => {
  const defaults = allowedOrigins();
  assert.equal(isAllowedOrigin("https://denloper.github.io", defaults), true);
  assert.equal(isAllowedOrigin("https://attacker.example", defaults), false);
  const configured = allowedOrigins("https://app.example,capacitor://localhost");
  assert.equal(isAllowedOrigin("https://app.example", configured), true);
  assert.equal(isAllowedOrigin("https://denloper.github.io", configured), false);
});

test("only exact proxy endpoints are accepted", () => {
  assert.equal(endpointFor("/chat")?.path, "/chat");
  assert.equal(endpointFor("/nested/chat"), null);
  assert.equal(endpointFor("/chat/")?.path, "/chat");
});

test("chat requests are capped and restricted to approved models", () => {
  const body = decode(
    sanitizeBody(
      "/chat",
      encode({
        model: "untrusted/expensive-model",
        models: ["untrusted/fallback", "openai/gpt-4o-mini"],
        max_tokens: 50_000,
        temperature: 7,
        messages: [{ role: "user", content: "Plan a ride" }],
      }),
    ),
  );
  assert.equal(body.model, "google/gemini-2.5-flash");
  assert.deepEqual(body.models, ["openai/gpt-4o-mini"]);
  assert.equal(body.max_tokens, 300);
  assert.equal(body.temperature, 1);
});

test("speech and transcription reject unsupported payloads", () => {
  assert.throws(() =>
    sanitizeBody("/speech", encode({ model: "untrusted/tts", input: "hello", voice: "voice" })),
  );
  assert.throws(() =>
    sanitizeBody("/transcribe", encode({ model: "openai/whisper-1", input_audio: { data: "abc", format: "exe" } })),
  );
});

test("rate limiter blocks requests above the configured window", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(checkRateLimit(key, 2, 60_000, 1).allowed, true);
  assert.equal(checkRateLimit(key, 2, 60_000, 2).allowed, true);
  assert.equal(checkRateLimit(key, 2, 60_000, 3).allowed, false);
});

test("rate limiter evicts old identities at its memory cap", () => {
  const prefix = `capacity-${Date.now()}-${Math.random()}`;
  const first = `${prefix}-0`;
  for (let index = 0; index < 10_005; index += 1) {
    checkRateLimit(`${prefix}-${index}`, 1, 60_000, 100);
  }
  assert.equal(checkRateLimit(first, 1, 60_000, 101).allowed, true);
});

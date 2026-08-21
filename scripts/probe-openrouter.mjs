const key = String(process.env.VITE_OPENROUTER_API_KEY || "").trim();
if (!key) {
  console.error("VITE_OPENROUTER_API_KEY is missing");
  process.exit(1);
}

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://denloper.github.io/welcome-bikers/",
    "X-Title": "Welcome Bikers CI probe",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    models: ["openai/gpt-4o-mini", "google/gemini-2.0-flash-001"],
    temperature: 0.2,
    max_tokens: 40,
    messages: [
      { role: "system", content: 'Reply JSON only: {"reply":"pong","intent":"chat"}' },
      { role: "user", content: "ping" },
    ],
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error("OpenRouter probe failed", res.status, body.slice(0, 400));
  process.exit(1);
}

const data = JSON.parse(body);
const content = data?.choices?.[0]?.message?.content || "";
if (!content) {
  console.error("OpenRouter returned empty content");
  process.exit(1);
}

console.log("OpenRouter OK model=", data.model, "snippet=", String(content).slice(0, 80).replace(/\s+/g, " "));

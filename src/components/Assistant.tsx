import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  categoryReply,
  geocodePlace,
  greeting,
  matchPlaces,
  notFoundReply,
  parseIntent,
  rideReply,
  topByCategory,
  unknownReply,
} from "../lib/assistant";
import { loadPlaces } from "../lib/data";
import { hushVoice, speakText, warmVoices } from "../lib/voice";
import type { Place } from "../types";

type Phase = "idle" | "listening" | "speaking";

type Card = { key: string; name: string; sub: string; lat: number; lon: number; rating?: number | null };

type Msg = { id: number; role: "user" | "bro"; text: string; cards?: Card[] };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognizerCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as new () => SpeechRecognitionLike | undefined) ||
    (w.webkitSpeechRecognition as new () => SpeechRecognitionLike | undefined) ||
    null
  ) as (new () => SpeechRecognitionLike) | null;
}

function placeCard(p: Place): Card {
  return {
    key: p.id,
    name: p.name,
    sub: [p.city, p.country].filter(Boolean).join(", "),
    lat: p.lat,
    lon: p.lon,
    rating: p.rating,
  };
}

export function RealBroAvatar({ phase, size = 46 }: { phase: Phase; size?: number }) {
  return (
    <span className={`rb-ava ${phase}`} style={{ width: size, height: size }} data-phase={phase}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="13" y="21" width="17" height="10" rx="5" fill="#0c0c0c" />
        <rect x="34" y="21" width="17" height="10" rx="5" fill="#0c0c0c" />
        <rect x="28" y="23" width="8" height="4" rx="2" fill="#0c0c0c" />
        <path
          d="M17 34 q15 12 30 0 q1 16 -11 21 q-4 2 -8 0 q-12 -5 -11 -21 z"
          fill="#0c0c0c"
        />
        <path d="M24 36 q8 6 16 0 l-2 5 q-6 4 -12 0 z" fill="#0c0c0c" />
      </svg>
    </span>
  );
}

function VoiceWaveform({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const draw = canvas?.getContext("2d");
    if (!canvas || !draw) return;

    let frame = 0;
    let stopped = false;
    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let levels: Uint8Array<ArrayBuffer> | null = null;

    const fit = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      draw.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    fit();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    resize?.observe(canvas);

    const paint = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      draw.clearRect(0, 0, width, height);
      const bars = 28;
      const gap = 2.5;
      const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
      const gradient = draw.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "#29aae1");
      gradient.addColorStop(0.55, "#3d8aff");
      gradient.addColorStop(1, "#e10600");
      draw.fillStyle = gradient;
      if (analyser && levels) analyser.getByteFrequencyData(levels);
      for (let i = 0; i < bars; i++) {
        const sample = levels
          ? levels[Math.min(levels.length - 1, Math.floor((i / bars) * Math.min(72, levels.length)))] / 255
          : 0.12 + Math.abs(Math.sin(now / 170 + i * 0.62)) * 0.16;
        const barHeight = Math.max(3, sample * (height - 2));
        draw.beginPath();
        draw.roundRect(i * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
        draw.fill();
      }
      frame = window.requestAnimationFrame(paint);
    };
    frame = window.requestAnimationFrame(paint);

    void navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((nextStream) => {
        if (stopped) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = nextStream;
        const AudioCtor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        audio = new AudioCtor();
        analyser = audio.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        levels = new Uint8Array(analyser.frequencyBinCount);
        source = audio.createMediaStreamSource(stream);
        source.connect(analyser);
        void audio.resume();
      })
      .catch(() => {
        // SpeechRecognition can still work when raw microphone access is unavailable.
      });

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      resize?.disconnect();
      source?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close();
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      className="rb-waveform"
      data-testid="assistant-waveform"
      role="img"
      aria-label="Live voice waveform"
    />
  );
}

let seq = 0;

export function RealBro() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const speakToken = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const hasMic = recognizerCtor() !== null;

  useEffect(() => {
    warmVoices();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  function push(msg: Omit<Msg, "id">) {
    setMsgs((m) => [...m, { ...msg, id: ++seq }]);
  }

  function say(text: string) {
    const token = ++speakToken.current;
    const done = () => {
      if (speakToken.current === token) setPhase("idle");
    };
    const started = speakText(text, "en-US", done);
    if (started) {
      setPhase("speaking");
      // Safety net: headless / muted browsers may never fire onend.
      window.setTimeout(done, Math.min(15_000, 1500 + text.length * 90));
    }
  }

  function openSheet() {
    setOpen(true);
    if (!msgs.length) {
      const hello = greeting();
      push({ role: "bro", text: hello });
      say(hello);
    }
  }

  function closeSheet() {
    setOpen(false);
    hushVoice();
    recRef.current?.stop();
    speakToken.current++;
    setPhase("idle");
  }

  async function handleQuery(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setBusy(true);
    push({ role: "user", text });
    try {
      const intent = parseIntent(text);
      if (intent.kind === "ride") {
        const places = await loadPlaces();
        const found = matchPlaces(places, intent.query);
        if (found.length) {
          const reply = rideReply(found[0].name, false);
          push({ role: "bro", text: reply, cards: found.map(placeCard) });
          say(reply);
        } else {
          const geo = await geocodePlace(intent.query);
          if (geo) {
            const reply = rideReply(geo.name, false);
            push({
              role: "bro",
              text: reply,
              cards: [{ key: `geo-${geo.lat}`, name: geo.name, sub: "Point on the map", lat: geo.lat, lon: geo.lon }],
            });
            say(reply);
          } else {
            const reply = notFoundReply(intent.query, false);
            push({ role: "bro", text: reply });
            say(reply);
          }
        }
      } else if (intent.kind === "category") {
        const places = await loadPlaces();
        const list = topByCategory(places, intent.type, intent.country);
        const reply = categoryReply(list.length, intent.type, intent.country, false);
        push({ role: "bro", text: reply, cards: list.map(placeCard) });
        say(reply);
      } else {
        const reply = unknownReply(false);
        push({ role: "bro", text: reply });
        say(reply);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSend() {
    const text = input;
    setInput("");
    void handleQuery(text);
  }

  function startListening() {
    const Ctor = recognizerCtor();
    if (!Ctor) return;
    if (phase === "listening") {
      recRef.current?.stop();
      setPhase("idle");
      return;
    }
    hushVoice();
    speakToken.current++;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      setPhase("idle");
      if (transcript) void handleQuery(transcript);
    };
    rec.onerror = () => setPhase("idle");
    rec.onend = () => setPhase((p) => (p === "listening" ? "idle" : p));
    recRef.current = rec;
    setPhase("listening");
    try {
      rec.start();
    } catch {
      setPhase("idle");
    }
  }

  function rideTo(card: Card) {
    closeSheet();
    nav(`/map?to=${card.lat},${card.lon}&name=${encodeURIComponent(card.name)}`);
  }

  const stateLabel = phase === "listening" ? "Listening…" : phase === "speaking" ? "Speaking…" : "Online";

  return (
    <>
      <button className="rb-row" data-testid="assistant-row" onClick={openSheet}>
        <span>AI assistant</span>
        <RealBroAvatar phase="idle" />
        <span>«Real Bro»</span>
      </button>

      {open && (
        <>
          <div className="backdrop" onClick={closeSheet} />
          <div className="rb-sheet" data-testid="assistant-sheet">
            <div className="rb-head">
              <RealBroAvatar phase={phase} size={52} />
              <div>
                <b>Real Bro</b>
                <span className="rb-state">{stateLabel}</span>
              </div>
              <button className="icon-btn" aria-label="Close assistant" onClick={closeSheet}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <VoiceWaveform active={phase === "listening"} />

            <div className="rb-msgs" ref={listRef}>
              {msgs.map((m) => (
                <div key={m.id} className={`rb-bubble ${m.role}`}>
                  {m.text}
                  {m.cards && m.cards.length > 0 && (
                    <div className="rb-cards">
                      {m.cards.map((c) => (
                        <div key={c.key} className="rb-card" data-testid="assistant-card">
                          <div className="rb-card-info">
                            <b>{c.name}</b>
                            <span>
                              {c.rating ? `★ ${c.rating.toFixed(1)} · ` : ""}
                              {c.sub}
                            </span>
                          </div>
                          <button className="rb-go" data-testid="assistant-ride" onClick={() => rideTo(c)}>
                            Go
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="rb-input">
              <input
                data-testid="assistant-input"
                value={input}
                placeholder='Say or type: "what bars are in Montenegro?"'
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
              />
              {hasMic && (
                <button
                  className={`rb-mic${phase === "listening" ? " on" : ""}`}
                  aria-label="Voice input"
                  onClick={startListening}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                </button>
              )}
              <button className="rb-send" data-testid="assistant-send" aria-label="Send" onClick={handleSend}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12h14M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

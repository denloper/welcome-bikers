/** Neural TTS for Real Bro via CORS proxy. Falls back to Web Speech. */

import { resolveProxyBase, speechUrl } from "./orProxy";

/** Deep male chain — bass / street energy when the provider allows. */
const TTS_TRIES: { model: string; voice: string; format: "mp3" | "pcm"; speed?: number; prompt?: string }[] = [
  {
    model: "minimax/speech-2.8-turbo",
    voice: "English_ManWithDeepVoice",
    format: "mp3",
  },
  {
    model: "deepgram/aura-2",
    voice: "aura-2-odysseus-en",
    format: "mp3",
    speed: 0.92,
  },
  {
    model: "google/gemini-3.1-flash-tts-preview",
    voice: "Charon",
    format: "pcm",
    prompt:
      "Speak as a deep-voiced male street biker: calm gangsta swagger, natural human pacing, warm bass, never robotic.",
  },
];

const cache = new Map<string, string>();
let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let playGen = 0;

export function hasNeuralTts(): boolean {
  return true;
}

export function hushNeuralVoice() {
  playGen++;
  try {
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
  } catch {
    /* ignore */
  }
  if (currentObjectUrl) {
    try {
      URL.revokeObjectURL(currentObjectUrl);
    } catch {
      /* ignore */
    }
    currentObjectUrl = null;
  }
}

function pcmToWav(pcm: ArrayBuffer, sampleRate = 24_000): Blob {
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm));
  return new Blob([buffer], { type: "audio/wav" });
}

async function fetchSpeech(text: string): Promise<Blob | null> {
  const base = await resolveProxyBase();
  if (!base) return null;

  const cached = cache.get(text);
  if (cached) {
    const res = await fetch(cached);
    if (res.ok) return res.blob();
  }

  const endpoint = speechUrl(base);
  for (const tryCfg of TTS_TRIES) {
    try {
      const body: Record<string, unknown> = {
        model: tryCfg.model,
        input: text,
        voice: tryCfg.voice,
        response_format: tryCfg.format,
      };
      if (tryCfg.speed != null) body.speed = tryCfg.speed;
      if (tryCfg.prompt) {
        body.provider = { options: { google: { prompt: tryCfg.prompt } } };
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      const raw = await res.arrayBuffer();
      if (!raw.byteLength) continue;
      const blob =
        tryCfg.format === "pcm"
          ? pcmToWav(raw, 24_000)
          : new Blob([raw], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      if (cache.size > 40) {
        const first = cache.keys().next().value;
        if (first) {
          const old = cache.get(first);
          cache.delete(first);
          if (old) URL.revokeObjectURL(old);
        }
      }
      cache.set(text, url);
      return blob;
    } catch {
      /* try next provider */
    }
  }
  return null;
}

function playBlob(blob: Blob, onDone?: () => void): boolean {
  hushNeuralVoice();
  const gen = playGen;
  const url = URL.createObjectURL(blob);
  currentObjectUrl = url;
  const audio = new Audio(url);
  currentAudio = audio;
  let done = false;
  const finish = () => {
    if (done || gen !== playGen) return;
    done = true;
    onDone?.();
  };
  audio.onended = finish;
  audio.onerror = finish;
  void audio.play().catch(finish);
  return true;
}

/**
 * Speak Real Bro with neural TTS (deep male). Returns true when playback started.
 * onDone always fires once. Falls back to the provided webSpeak callback.
 */
export async function speakBroNeural(
  text: string,
  onDone?: () => void,
  webSpeak?: (text: string, onDone?: () => void) => boolean,
): Promise<boolean> {
  const clean = text.trim();
  if (!clean) {
    onDone?.();
    return false;
  }
  try {
    const blob = await fetchSpeech(clean);
    if (!blob) return webSpeak?.(clean, onDone) ?? (onDone?.(), false);
    return playBlob(blob, onDone);
  } catch {
    return webSpeak?.(clean, onDone) ?? (onDone?.(), false);
  }
}

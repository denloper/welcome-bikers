/** Mobile-friendly STT: MediaRecorder + OpenRouter Whisper via CORS proxy (iOS has no Web Speech). */

import { resolveProxyBase, transcribeUrl } from "./orProxy";

const STT_MODEL = "openai/whisper-1";

export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS desktop UA
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function canMediaRecord(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(navigator.mediaDevices && typeof MediaRecorder !== "undefined");
}

/** Prefer recording on Apple / when SpeechRecognition is missing. */
export function preferRecordStt(hasSpeechApi: boolean): boolean {
  if (!canMediaRecord()) return false;
  if (isAppleMobile()) return true;
  return !hasSpeechApi;
}

function pickMime(): { mime: string; format: string } {
  const candidates: { mime: string; format: string }[] = [
    { mime: "audio/mp4", format: "mp4" },
    { mime: "audio/aac", format: "aac" },
    { mime: "audio/webm;codecs=opus", format: "webm" },
    { mime: "audio/webm", format: "webm" },
    { mime: "audio/ogg;codecs=opus", format: "ogg" },
  ];
  for (const c of candidates) {
    try {
      if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(c.mime)) {
        return c;
      }
    } catch {
      /* try next */
    }
  }
  return { mime: "", format: "webm" };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const i = dataUrl.indexOf(",");
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
    };
    reader.readAsDataURL(blob);
  });
}

export async function transcribeAudioBlob(blob: Blob, formatHint: string): Promise<string | null> {
  if (!blob.size) return null;
  const base = await resolveProxyBase();
  if (!base) return null;
  const format = formatHint || (blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm");
  try {
    const data = await blobToBase64(blob);
    const res = await fetch(transcribeUrl(base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: STT_MODEL,
        language: "en",
        input_audio: { data, format },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { text?: string };
    const text = String(json.text || "").trim();
    return text || null;
  } catch {
    return null;
  }
}

export type RecSession = {
  format: string;
  stop: () => Promise<Blob | null>;
  /** RMS 0..1 for silence UI / auto-stop */
  level: () => number;
};

/** Start mic capture. Must run inside a user gesture on iOS. */
export async function startMicCapture(): Promise<RecSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const { mime, format } = pickMime();
  const chunks: BlobPart[] = [];
  const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const usedFormat =
    format ||
    (rec.mimeType.includes("mp4") ? "mp4" : rec.mimeType.includes("ogg") ? "ogg" : "webm");

  rec.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };

  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Uint8Array | null = null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AC();
    await audioCtx.resume();
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  } catch {
    /* level meter optional */
  }

  rec.start(250);

  return {
    format: usedFormat,
    level: () => {
      if (!analyser || !data) return 0;
      analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / data.length);
    },
    stop: () =>
      new Promise((resolve) => {
        const finish = () => {
          stream.getTracks().forEach((t) => t.stop());
          void audioCtx?.close();
          const type = rec.mimeType || mime || "audio/webm";
          resolve(chunks.length ? new Blob(chunks, { type }) : null);
        };
        if (rec.state === "inactive") {
          finish();
          return;
        }
        rec.onstop = finish;
        try {
          rec.stop();
        } catch {
          finish();
        }
      }),
  };
}

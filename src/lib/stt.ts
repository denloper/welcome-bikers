/** Mobile STT: MediaRecorder + Whisper. Mobile Web Speech is not reliable enough. */

import { resolveProxyBase, transcribeUrl } from "./orProxy";

const STT_MODEL = "openai/whisper-1";

export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isMobileSttDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  if (isAppleMobile()) return true;
  return /Android|Mobile|Tablet|Silk|Kindle/i.test(navigator.userAgent || "");
}

export function canMediaRecord(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined",
  );
}

/** Prefer deterministic server STT on every phone/tablet, not only Apple devices. */
export function preferRecordStt(hasSpeechApi: boolean): boolean {
  if (!canMediaRecord()) return false;
  if (isMobileSttDevice()) return true;
  return !hasSpeechApi;
}

function pickMime(): { mime: string; format: string } {
  const apple = isAppleMobile();
  const candidates: { mime: string; format: string }[] = apple
    ? [
        { mime: "audio/mp4", format: "m4a" },
        { mime: "audio/aac", format: "aac" },
        { mime: "audio/webm;codecs=opus", format: "webm" },
        { mime: "audio/webm", format: "webm" },
      ]
    : [
        { mime: "audio/webm;codecs=opus", format: "webm" },
        { mime: "audio/webm", format: "webm" },
        { mime: "audio/ogg;codecs=opus", format: "ogg" },
        { mime: "audio/mp4", format: "m4a" },
        { mime: "audio/aac", format: "aac" },
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
  return { mime: "", format: isAppleMobile() ? "m4a" : "webm" };
}

function formatFromBlob(blob: Blob, hint: string): string {
  if (hint) return hint;
  const t = blob.type.toLowerCase();
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "m4a";
  if (t.includes("ogg")) return "ogg";
  return "webm";
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
  const format = formatFromBlob(blob, formatHint);
  const data = await blobToBase64(blob);
  for (let attempt = 0; attempt < 2; attempt++) {
    const base = await resolveProxyBase(attempt > 0);
    if (!base) continue;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await fetch(transcribeUrl(base), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: STT_MODEL,
          // No language hint: riders can speak in their own language.
          input_audio: { data, format },
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        const text = String(json.text || "").trim();
        return text || null;
      }
      if (res.status < 500 && res.status !== 408 && res.status !== 429) return null;
    } catch {
      /* Refresh an expired tunnel URL and retry once. */
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}

export type RecSession = {
  format: string;
  stop: () => Promise<Blob | null>;
  level: () => number;
};

async function openMicStream(): Promise<MediaStream> {
  const detailed: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
  try {
    return await navigator.mediaDevices.getUserMedia(detailed);
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

/**
 * Must run inside the tap that starts listening.
 * iOS drops the user-gesture if we await a timeout first.
 */
export async function startMicCapture(): Promise<RecSession> {
  const apple = isAppleMobile();
  const stream = await openMicStream();
  const { mime, format } = pickMime();
  const chunks: BlobPart[] = [];
  let rec: MediaRecorder;
  try {
    rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch {
    rec = new MediaRecorder(stream);
  }
  const actualMime = rec.mimeType || mime;
  const usedFormat = rec.mimeType
    ? formatFromBlob(new Blob([], { type: actualMime }), "")
    : format || formatFromBlob(new Blob([], { type: actualMime }), "");

  rec.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };

  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AC();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  } catch {
    /* level meter optional — tap-to-send still works */
  }

  // One final chunk is the most compatible path across Safari and Android WebViews.
  rec.start();

  const teardown = () => {
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    void audioCtx?.close().catch(() => undefined);
  };

  return {
    format: usedFormat,
    level: () => {
      if (!analyser || !data) return 0;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / data.length);
    },
    stop: () =>
      new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          teardown();
          const type = rec.mimeType || mime || (apple ? "audio/mp4" : "audio/webm");
          resolve(chunks.length ? new Blob(chunks, { type }) : null);
        };
        if (rec.state === "inactive") {
          finish();
          return;
        }
        rec.onstop = finish;
        window.setTimeout(finish, 3000);
        try {
          rec.stop();
        } catch {
          finish();
        }
      }),
  };
}

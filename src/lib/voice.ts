import type { NavStep } from "./osrm";

export type VoicePhase = "approach" | "now" | "arrived";

export type VoiceState = {
  stepI: number;
  approach: boolean;
  now: boolean;
  arrived: boolean;
};

export function freshVoiceState(): VoiceState {
  return { stepI: -1, approach: false, now: false, arrived: false };
}

export function turnVerb(step: NavStep | undefined): string {
  if (!step) return "continue";
  if (step.type === "arrive") return "arrive";
  const m = (step.modifier || step.type || "").toLowerCase();
  if (m.includes("uturn") || m.includes("u-turn")) return "make a U-turn";
  if (m.includes("sharp") && m.includes("left")) return "turn sharp left";
  if (m.includes("sharp") && m.includes("right")) return "turn sharp right";
  if (m.includes("slight") && m.includes("left")) return "turn slightly left";
  if (m.includes("slight") && m.includes("right")) return "turn slightly right";
  if (m.includes("left")) return "turn left";
  if (m.includes("right")) return "turn right";
  if (m.includes("roundabout")) return "enter the roundabout";
  if (step.type === "depart" || m.includes("straight")) return "continue straight";
  return "continue";
}

function onto(step: NavStep | undefined): string {
  const name = step?.name?.trim();
  if (!name || step?.type === "arrive") return "";
  const lower = name.toLowerCase();
  if (lower.startsWith("toward ") || lower === "destination") return "";
  return ` onto ${name}`;
}

export function voiceLine(phase: VoicePhase, step?: NavStep, meters?: number): string {
  if (phase === "arrived") return "You have arrived";
  const action = `${turnVerb(step)}${onto(step)}`;
  if (phase === "now") {
    if (step?.type === "arrive") return "You have arrived";
    return action.charAt(0).toUpperCase() + action.slice(1);
  }
  const m = meters ?? 200;
  const rounded = m >= 225 ? 250 : m >= 175 ? 200 : 150;
  if (step?.type === "arrive") return `In ${rounded} meters, you will arrive`;
  return `In ${rounded} meters, ${action}`;
}

export function nextVoice(
  state: VoiceState,
  opts: { arrived: boolean; stepI: number; stepRemain: number; next?: NavStep },
): { state: VoiceState; line: string | null } {
  if (opts.arrived) {
    if (state.arrived) return { state, line: null };
    return { state: { ...state, arrived: true }, line: voiceLine("arrived") };
  }
  let next = state;
  if (opts.stepI !== state.stepI) {
    next = { stepI: opts.stepI, approach: false, now: false, arrived: false };
  }
  const step = opts.next;
  const remain = opts.stepRemain;
  if (!step) return { state: next, line: null };
  if (!next.approach && remain <= 250 && remain >= 120) {
    return { state: { ...next, approach: true }, line: voiceLine("approach", step, remain) };
  }
  if (!next.now && remain <= 45) {
    return { state: { ...next, now: true, approach: true }, line: voiceLine("now", step) };
  }
  return { state: next, line: null };
}

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesHooked = false;

function refreshVoices() {
  try {
    cachedVoices = window.speechSynthesis?.getVoices?.() || [];
  } catch {
    cachedVoices = [];
  }
}

/**
 * Chrome populates getVoices() asynchronously; without warming it the first
 * prompt falls back to the robotic default voice. Call early (page mount).
 */
export function warmVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (!voicesHooked) {
    voicesHooked = true;
    window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
  }
  refreshVoices();
}

const NOVELTY = [
  "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "good news",
  "jester", "organ", "superstar", "trinoids", "whisper", "wobble", "zarvox",
];

const MALE =
  /\b(guy|davis|eric|brian|daniel|david|mark|matthew|ryan|tony|christopher|steffan|andrew|roger|george|james|michael|nathan|tom|alex|fred|geraint|ravi|jason|wayne|eddy)\b/;
const FEMALE =
  /\b(ava|aria|jenny|samantha|allison|joanna|emma|zira|susan|hazel|sonia|karen|moira|tessa|fiona|victoria|salli|ivy|kendra|kimberly|nicole|raveena|amy|linda|heera)\b/;

/** Bass-leaning male English — Web Speech cannot do a real gangsta voice. */
export const BRO_VOICE = { rate: 0.9, pitch: 0.78 };

function genderAdjust(name: string): number {
  if (FEMALE.test(name) || /\bfemale\b/.test(name)) return -36;
  if (MALE.test(name) || /\bmale\b/.test(name)) return 28;
  return 0;
}

export function voiceScore(voice: { name: string; lang: string; localService?: boolean }): number {
  const lang = voice.lang.toLowerCase().replace("_", "-");
  if (!lang.startsWith("en")) return -1;
  const name = voice.name.toLowerCase();
  if (NOVELTY.some((bad) => name.includes(bad))) return -1;
  let score = lang.startsWith("en-us") ? 40 : lang.startsWith("en-gb") ? 34 : 28;
  if (name.includes("natural")) score += 60;
  if (name.includes("neural")) score += 55;
  if (name.includes("premium") || name.includes("enhanced")) score += 42;
  if (name.includes("siri")) score += 36;
  if (name.includes("google")) score += 30;
  if (name.includes("online")) score += 12;
  score += genderAdjust(name);
  if (name.includes("compact")) score -= 40;
  if (voice.localService === false) score += 8;
  return score;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!cachedVoices.length) warmVoices();
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const voice of cachedVoices) {
    const score = voiceScore(voice);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best;
}

export function hushVoice() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

function qualityScoreFor(voice: { name: string; lang: string; localService?: boolean }, lang: string): number {
  const vl = voice.lang.toLowerCase().replace("_", "-");
  const want = lang.toLowerCase();
  const base = want.split("-")[0];
  if (!vl.startsWith(base)) return -1;
  const name = voice.name.toLowerCase();
  if (NOVELTY.some((bad) => name.includes(bad))) return -1;
  let score = vl.startsWith(want) ? 40 : 28;
  if (name.includes("natural")) score += 60;
  if (name.includes("neural")) score += 55;
  if (name.includes("premium") || name.includes("enhanced")) score += 42;
  if (name.includes("siri")) score += 36;
  if (name.includes("google")) score += 30;
  if (name.includes("online")) score += 12;
  score += genderAdjust(name);
  if (name.includes("compact")) score -= 40;
  if (voice.localService === false) score += 8;
  return score;
}

/**
 * Speak in an explicit language (assistant replies can be Russian). Keeps
 * speakLine untouched: that one is tuned for English driving prompts.
 * Returns true when speech actually started; onDone always fires once.
 */
export function speakText(text: string, lang: string, onDone?: () => void): boolean {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) {
    onDone?.();
    return false;
  }
  try {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = BRO_VOICE.rate;
    u.pitch = BRO_VOICE.pitch;
    u.volume = 1;
    if (!cachedVoices.length) warmVoices();
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -1;
    for (const voice of cachedVoices) {
      const score = qualityScoreFor(voice, lang);
      if (score > bestScore) {
        bestScore = score;
        best = voice;
      }
    }
    if (best) {
      u.voice = best;
      u.lang = best.lang || lang;
    }
    if (onDone) {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          onDone();
        }
      };
      u.onend = finish;
      u.onerror = finish;
    }
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    onDone?.();
    return false;
  }
}

export function speakLine(text: string) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = BRO_VOICE.rate;
    u.pitch = BRO_VOICE.pitch;
    u.volume = 1;
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang || "en-US";
    }
    window.speechSynthesis.speak(u);
  } catch {
    /* mute / blocked */
  }
}

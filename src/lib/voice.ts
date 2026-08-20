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

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("en-us")) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ||
    null
  );
}

export function hushVoice() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export function speakLine(text: string) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.02;
    u.pitch = 1;
    const voice = pickVoice();
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  } catch {
    /* mute / blocked */
  }
}

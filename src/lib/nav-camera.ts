export const NAV_MOVE_MS = 480;
export const NAV_FLAT_ENTRY_MS = 600;
export const NAV_ENTER_MS = 650;
export const NAV_HEADING_MS = 240;
export const NAV_FOLLOW_RESUME_MS = 10_000;

export type NavPoint = { lat: number; lon: number };

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Smooth acceleration and deceleration without overshooting GPS fixes. */
export function easeInOutCubic(value: number): number {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/** Signed shortest turn from one compass angle to another. */
export function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function interpolateAngle(from: number, to: number, amount: number): number {
  return (from + angleDelta(from, to) * clamp01(amount) + 360) % 360;
}

export function interpolatePoint(from: NavPoint, to: NavPoint, amount: number): NavPoint {
  const t = clamp01(amount);
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lon: from.lon + (to.lon - from.lon) * t,
  };
}

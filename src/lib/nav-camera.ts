export const NAV_MOVE_MS = 480;
export const NAV_FLAT_ENTRY_MS = 600;
export const NAV_ENTER_MS = 650;
export const NAV_HEADING_MS = 240;
export const NAV_FOLLOW_RESUME_MS = 10_000;
export const NAV_LOOK_AHEAD_MIN_M = 55;
export const NAV_LOOK_AHEAD_MAX_M = 145;
export const NAV_ZOOM_MIN = 16.7;
export const NAV_ZOOM_MAX = 18.2;

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

/**
 * Keep more road visible as the rider speeds up. GPS speed is metres/second.
 * The fallback favours a close city view without jumping on missing fixes.
 */
export function navLookAheadMeters(speedMps?: number | null): number {
  const speed = Number.isFinite(speedMps) ? Math.max(0, Number(speedMps)) : 8;
  return Math.round(
    Math.max(NAV_LOOK_AHEAD_MIN_M, Math.min(NAV_LOOK_AHEAD_MAX_M, NAV_LOOK_AHEAD_MIN_M + speed * 3.2)),
  );
}

/** Google-like close zoom in town, wider view at highway speed. */
export function navZoomForSpeed(speedMps?: number | null): number {
  const speed = Number.isFinite(speedMps) ? Math.max(0, Number(speedMps)) : 8;
  const t = clamp01((speed - 3) / 27);
  return NAV_ZOOM_MAX + (NAV_ZOOM_MIN - NAV_ZOOM_MAX) * t;
}

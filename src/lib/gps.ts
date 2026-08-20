import { bearingDeg, haversineKm, validCoords } from "./geo";

export type RawGpsFix = {
  lat: number;
  lon: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
};

export type FilteredGpsFix = RawGpsFix & {
  heading: number | null;
  speed: number | null;
};

export type GpsFilterState = {
  fix: FilteredGpsFix | null;
  rejects: number;
};

export type GpsFilterResult = {
  state: GpsFilterState;
  fix: FilteredGpsFix | null;
  accepted: boolean;
  reason?: "invalid" | "inaccurate" | "jump";
};

/** After this many consecutive rejections the filter resets and trusts the new fix. */
const MAX_REJECTS = 2;
/** A previous fix older than this no longer vetoes new data (tunnel, app switch, GPS gap). */
const STALE_MS = 10_000;

export function freshGpsState(): GpsFilterState {
  return { fix: null, rejects: 0 };
}

export function lerpAngle(from: number, to: number, amount: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * Math.max(0, Math.min(1, amount)) + 360) % 360;
}

function validHeading(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value >= 0 && value <= 360;
}

function acceptRaw(raw: RawGpsFix, accuracy: number): GpsFilterResult {
  const fix: FilteredGpsFix = {
    ...raw,
    accuracy,
    heading: validHeading(raw.heading) ? Number(raw.heading) : null,
    speed: raw.speed != null && Number.isFinite(raw.speed) ? Math.max(0, raw.speed) : null,
  };
  return { state: { fix, rejects: 0 }, fix, accepted: true };
}

export function filterGpsFix(state: GpsFilterState, raw: RawGpsFix): GpsFilterResult {
  if (!validCoords(raw.lat, raw.lon)) return { state, fix: null, accepted: false, reason: "invalid" };
  const accuracy = Number.isFinite(raw.accuracy) ? Math.max(1, raw.accuracy) : 120;
  const previous = state.fix;

  // Navigation must always be able to start and recover: the very first fix,
  // or the first fix after a long GPS gap, is trusted no matter how coarse.
  if (!previous || raw.timestamp - previous.timestamp > STALE_MS) {
    return acceptRaw(raw, accuracy);
  }

  if (accuracy > 150) {
    if (state.rejects >= MAX_REJECTS) return acceptRaw(raw, accuracy);
    return {
      state: { fix: previous, rejects: state.rejects + 1 },
      fix: null,
      accepted: false,
      reason: "inaccurate",
    };
  }

  const dt = Math.max(0.25, (raw.timestamp - previous.timestamp) / 1000);
  const rawPoint = { lat: raw.lat, lon: raw.lon };
  const movedM = haversineKm(previous, rawPoint) * 1000;
  const reportedSpeed = raw.speed != null && Number.isFinite(raw.speed) ? Math.max(0, raw.speed) : null;
  const uncertainty = Math.max(accuracy, previous.accuracy) * 2.2;
  const plausibleM = uncertainty + Math.max(55, (reportedSpeed || previous.speed || 0) * 2.5) * dt;
  if (movedM > plausibleM && movedM / dt > 75) {
    if (state.rejects >= MAX_REJECTS) return acceptRaw(raw, accuracy);
    return {
      state: { fix: previous, rejects: state.rejects + 1 },
      fix: null,
      accepted: false,
      reason: "jump",
    };
  }

  let alpha = accuracy <= 10 ? 0.72 : accuracy <= 25 ? 0.52 : 0.34;
  if ((reportedSpeed || 0) > 12) alpha = Math.max(alpha, 0.78);
  if (movedM < Math.max(2, accuracy * 0.2)) alpha *= 0.55;

  const lat = previous.lat + (raw.lat - previous.lat) * alpha;
  const lon = previous.lon + (raw.lon - previous.lon) * alpha;
  let candidateHeading: number | null = null;
  if (validHeading(raw.heading) && (reportedSpeed == null || reportedSpeed > 0.8)) {
    candidateHeading = Number(raw.heading);
  } else if (movedM > Math.max(3, accuracy * 0.25)) {
    candidateHeading = (bearingDeg(previous, rawPoint) + 360) % 360;
  }
  const heading =
    candidateHeading == null
      ? previous.heading
      : previous.heading == null
        ? candidateHeading
        : lerpAngle(previous.heading, candidateHeading, (reportedSpeed || 0) > 10 ? 0.48 : 0.3);

  const fix: FilteredGpsFix = {
    lat,
    lon,
    accuracy,
    heading,
    speed: reportedSpeed,
    timestamp: raw.timestamp,
  };
  return { state: { fix, rejects: 0 }, fix, accepted: true };
}

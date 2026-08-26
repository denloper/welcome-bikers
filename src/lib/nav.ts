import { closestOnPolyline, haversineKm, pointAhead } from "./geo";
import { navLookAheadMeters } from "./nav-camera";
import type { DriveRoute } from "./osrm";

export const MIN_NAV_METERS = 80;
export const OFF_ROUTE_M = 80;
export const REROUTE_HOLD_MS = 3200;
export const REROUTE_COOLDOWN_MS = 12_000;

export type RerouteState = {
  offSince: number;
  lastReroute: number;
};

export function freshRerouteState(): RerouteState {
  return { offSince: 0, lastReroute: 0 };
}

export function routeDeviationThreshold(accuracyM: number): number {
  return Math.max(OFF_ROUTE_M, Math.min(180, Math.max(0, accuracyM) * 2));
}

export function navTrackingTarget(
  points: [number, number][],
  gps: { lat: number; lon: number },
  accuracyM: number,
  speedMps?: number | null,
) {
  if (points.length < 2) {
    return { rider: gps, camera: gps, onRoad: false, distanceM: Number.POSITIVE_INFINITY };
  }
  const snap = closestOnPolyline(points, gps);
  const distanceM = snap.distKm * 1000;
  const onRoad = distanceM <= routeDeviationThreshold(accuracyM);
  const rider = onRoad ? { lat: snap.lat, lon: snap.lon } : gps;
  const camera = onRoad ? pointAhead(points, rider, navLookAheadMeters(speedMps)) : rider;
  return { rider, camera, onRoad, distanceM };
}

export function updateReroute(
  state: RerouteState,
  input: { now: number; distanceM: number; accuracyM: number; pending: boolean },
): { state: RerouteState; trigger: boolean; thresholdM: number; offRoute: boolean } {
  const thresholdM = routeDeviationThreshold(input.accuracyM);
  if (!Number.isFinite(input.distanceM) || input.accuracyM > 120) {
    return { state, trigger: false, thresholdM, offRoute: false };
  }
  if (input.distanceM <= thresholdM * 0.72) {
    return { state: { ...state, offSince: 0 }, trigger: false, thresholdM, offRoute: false };
  }
  if (input.distanceM <= thresholdM) {
    return { state, trigger: false, thresholdM, offRoute: state.offSince > 0 };
  }
  const offSince = state.offSince || input.now;
  const ready =
    !input.pending &&
    input.now - offSince >= REROUTE_HOLD_MS &&
    input.now - state.lastReroute >= REROUTE_COOLDOWN_MS;
  return {
    state: ready ? { offSince, lastReroute: input.now } : { ...state, offSince },
    trigger: ready,
    thresholdM,
    offRoute: true,
  };
}

export function tripTooShort(points: { lat: number; lon: number }[]): boolean {
  if (points.length < 2) return true;
  if (points.length > 2) return false;
  return haversineKm(points[0], points[points.length - 1]) * 1000 < MIN_NAV_METERS;
}

export function remainingAlong(
  route: DriveRoute,
  here: { lat: number; lon: number },
  previousIndex?: number,
) {
  const pts = route.geometry;
  if (pts.length < 2 || route.distance < MIN_NAV_METERS) {
    return {
      distance: route.distance,
      duration: route.duration,
      stepI: 0,
      stepRemain: route.distance,
      arrived: false,
      routeIndex: 0,
      routePoint: (pts[0] || [here.lat, here.lon]) as [number, number],
      progress: 0,
    };
  }
  const last = pts[pts.length - 1];
  const bounded =
    previousIndex == null
      ? closestOnPolyline(pts, here)
      : closestOnPolyline(pts, here, {
          start: Math.max(0, previousIndex - 3),
          end: Math.min(pts.length - 2, previousIndex + 80),
        });
  const snap = previousIndex != null && bounded.distKm > 1 ? closestOnPolyline(pts, here) : bounded;
  const distToEnd = haversineKm(here, { lat: last[0], lon: last[1] });
  if (distToEnd < 0.08 && snap.distKm < 0.2) {
    return {
      distance: 0,
      duration: 0,
      stepI: Math.max(0, route.steps.length - 1),
      stepRemain: 0,
      arrived: true,
      routeIndex: pts.length - 1,
      routePoint: last,
      progress: 1,
    };
  }
  const nextI = Math.min(snap.index + 1, pts.length - 1);
  let rest = haversineKm(snap, { lat: pts[nextI][0], lon: pts[nextI][1] }) * 1000;
  let geometryDistance = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    geometryDistance +=
      haversineKm({ lat: pts[i][0], lon: pts[i][1] }, { lat: pts[i + 1][0], lon: pts[i + 1][1] }) * 1000;
  }
  for (let i = nextI; i < pts.length - 1; i++) {
    rest += haversineKm({ lat: pts[i][0], lon: pts[i][1] }, { lat: pts[i + 1][0], lon: pts[i + 1][1] }) * 1000;
  }
  if (rest < 8 && distToEnd < 0.08) {
    return {
      distance: 0,
      duration: 0,
      stepI: Math.max(0, route.steps.length - 1),
      stepRemain: 0,
      arrived: true,
      routeIndex: pts.length - 1,
      routePoint: last,
      progress: 1,
    };
  }
  const ratio = geometryDistance > 0 ? Math.min(1, Math.max(0, rest / geometryDistance)) : 1;
  const remainingDistance = route.distance * ratio;
  const traveled = Math.max(0, route.distance - remainingDistance);
  let acc = 0;
  let stepI = 0;
  for (let i = 0; i < route.steps.length; i++) {
    acc += route.steps[i].distance;
    if (acc >= traveled) {
      stepI = i;
      break;
    }
    stepI = i;
  }
  const stepRemain = Math.max(1, acc - traveled);
  return {
    distance: Math.max(1, remainingDistance),
    duration: Math.max(1, route.duration * ratio),
    stepI,
    stepRemain,
    arrived: false,
    routeIndex: snap.index,
    routePoint: [snap.lat, snap.lon] as [number, number],
    progress: Math.max(0, Math.min(1, 1 - ratio)),
  };
}

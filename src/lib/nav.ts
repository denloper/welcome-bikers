import { haversineKm, nearestIndex } from "./geo";
import type { DriveRoute } from "./osrm";

export const MIN_NAV_METERS = 80;

export function tripTooShort(points: { lat: number; lon: number }[]): boolean {
  if (points.length < 2) return true;
  if (points.length > 2) return false;
  return haversineKm(points[0], points[points.length - 1]) * 1000 < MIN_NAV_METERS;
}

export function remainingAlong(route: DriveRoute, here: { lat: number; lon: number }) {
  const pts = route.geometry;
  if (pts.length < 2 || route.distance < MIN_NAV_METERS) {
    return { distance: route.distance, duration: route.duration, stepI: 0, arrived: false };
  }
  const last = pts[pts.length - 1];
  const bestI = nearestIndex(pts, here);
  const distToLine = haversineKm(here, { lat: pts[bestI][0], lon: pts[bestI][1] });
  const distToEnd = haversineKm(here, { lat: last[0], lon: last[1] });
  if (distToEnd < 0.08 && distToLine < 0.2) {
    return { distance: 0, duration: 0, stepI: Math.max(0, route.steps.length - 1), arrived: true };
  }
  if (distToLine > 0.8) {
    return { distance: route.distance, duration: route.duration, stepI: 0, arrived: false };
  }
  let rest = 0;
  for (let i = bestI; i < pts.length - 1; i++) {
    rest += haversineKm({ lat: pts[i][0], lon: pts[i][1] }, { lat: pts[i + 1][0], lon: pts[i + 1][1] }) * 1000;
  }
  if (rest < 8 && distToEnd < 0.08) {
    return { distance: 0, duration: 0, stepI: Math.max(0, route.steps.length - 1), arrived: true };
  }
  const ratio = route.distance > 0 ? Math.min(1, Math.max(0, rest / route.distance)) : 1;
  const traveled = Math.max(0, route.distance - rest);
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
  return {
    distance: Math.max(1, rest),
    duration: Math.max(1, route.duration * ratio),
    stepI,
    arrived: false,
  };
}

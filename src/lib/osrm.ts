import {
  DEFAULT_ROUTING_OPTIONS,
  type DriveRoute,
  type LatLon,
  type ManeuverPreview,
  type NavStep,
  type RoutingOptions,
} from "./routing-types";

export type { DriveRoute, LatLon, NavStep, RouteProfile, RoutingOptions } from "./routing-types";

type OsrmJson = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: {
      steps?: {
        name?: string;
        distance?: number;
        duration?: number;
        maneuver?: {
          type?: string;
          modifier?: string;
          location?: [number, number];
        };
      }[];
    }[];
  }[];
};

type ValhallaJson = {
  trip?: {
    summary?: { length?: number; time?: number };
    legs?: {
      shape?: string;
      maneuvers?: {
        type?: number;
        street_names?: string[];
        instruction?: string;
        time?: number;
        length?: number;
        begin_shape_index?: number;
      }[];
    }[];
  };
};

const OSRM_HOSTS = [
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
];

function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = 10 ** precision;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

function stepsFromOsrm(route: NonNullable<OsrmJson["routes"]>[number], fallback: LatLon): NavStep[] {
  const steps: NavStep[] = [];
  for (const leg of route.legs || []) {
    for (const s of leg.steps || []) {
      const loc = s.maneuver?.location;
      steps.push({
        name: s.name || "",
        distance: s.distance || 0,
        duration: s.duration || 0,
        type: s.maneuver?.type || "",
        modifier: s.maneuver?.modifier || "",
        location: loc ? [loc[1], loc[0]] : [fallback.lat, fallback.lon],
      });
    }
  }
  return steps;
}

const VALHALLA_TURN: Record<number, string> = {
  8: "slight right",
  9: "right",
  10: "sharp right",
  15: "slight left",
  16: "left",
  17: "sharp left",
  18: "uturn",
  19: "uturn",
};

async function fetchOsrm(
  host: string,
  points: LatLon[],
  opts: RoutingOptions,
): Promise<DriveRoute[]> {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const q = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "true",
    alternatives: opts.alternatives !== false && points.length === 2 ? "true" : "false",
  });
  try {
    const res = await fetch(`${host}${coords}?${q}`);
    if (!res.ok) return [];
    const data = (await res.json()) as OsrmJson;
    return (data.routes || [])
      .slice(0, opts.alternatives !== false && points.length === 2 ? 3 : 1)
      .flatMap((route, index): DriveRoute[] => {
        const line = route.geometry?.coordinates;
        if (!line?.length) return [];
        return [{
          id: `osrm-${index}-${Math.round(route.distance)}-${Math.round(route.duration)}`,
          provider: "osrm",
          profile: opts.profile,
          trafficAware: false,
          summary: index === 0 ? "Recommended" : `Alternative ${index + 1}`,
          geometry: line.map(([lon, lat]) => [lat, lon]),
          distance: route.distance,
          duration: route.duration,
          steps: stepsFromOsrm(route, points[0]),
        }];
      });
  } catch {
    return [];
  }
}

async function fetchValhalla(
  points: LatLon[],
  opts: RoutingOptions,
): Promise<DriveRoute[]> {
  try {
    const useHighways = opts.profile === "fastest" ? 0.75 : opts.profile === "scenic" ? 0.2 : 0;
    const useTrails = opts.pavedOnly ? 0 : opts.profile === "scenic" ? 0.18 : 0.04;
    const res = await fetch("https://valhalla1.openstreetmap.de/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: points.map((p) => ({ lat: p.lat, lon: p.lon })),
        costing: "motorcycle",
        costing_options: {
          motorcycle: {
            use_tolls: opts.allowTolls ? 0.5 : 0,
            use_highways: useHighways,
            use_ferry: opts.allowFerries ? 0.5 : 0,
            use_trails: useTrails,
          },
        },
        alternates: opts.alternatives !== false && points.length === 2 ? 2 : 0,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as ValhallaJson;
    const legs = data.trip?.legs || [];
    const geometry: [number, number][] = [];
    const steps: NavStep[] = [];
    for (const leg of legs) {
      if (leg.shape) geometry.push(...decodePolyline(leg.shape, 6));
      for (const m of leg.maneuvers || []) {
        const i = Math.min(m.begin_shape_index || 0, Math.max(0, geometry.length - 1));
        const pt = geometry[i] || [points[0].lat, points[0].lon];
        const name = m.street_names?.[0] || "";
        steps.push({
          name,
          distance: (m.length || 0) * 1000,
          duration: m.time || 0,
          type: m.type === 4 ? "arrive" : m.type === 1 ? "depart" : "turn",
          modifier: VALHALLA_TURN[m.type || 0] || "straight",
          location: pt,
        });
      }
    }
    if (geometry.length < 2) return [];
    const summary = data.trip?.summary;
    const distance = (summary?.length || 0) * 1000 || geometry.length;
    const duration = summary?.time || 0;
    return [{
      id: `valhalla-${Math.round(distance)}-${Math.round(duration)}`,
      provider: "valhalla",
      profile: opts.profile,
      trafficAware: false,
      summary: opts.profile === "scenic" ? "Scenic motorcycle route" : "Motorcycle route",
      geometry,
      distance,
      duration,
      steps,
    }];
  } catch {
    return [];
  }
}

export async function osrmRoutes(
  points: LatLon[],
  options?: Partial<RoutingOptions>,
): Promise<DriveRoute[]> {
  if (points.length < 2) return [];
  const opts = { ...DEFAULT_ROUTING_OPTIONS, ...options };
  const needsMotoProfile =
    opts.profile !== "fastest" || !opts.allowTolls || !opts.allowFerries || opts.pavedOnly;
  if (needsMotoProfile) {
    const motorcycle = await fetchValhalla(points, opts);
    if (motorcycle.length) return motorcycle;
  }
  for (const host of OSRM_HOSTS) {
    const routes = await fetchOsrm(host, points, opts);
    if (routes.length) return routes;
  }
  return fetchValhalla(points, opts);
}

export async function osrmRoute(
  points: LatLon[],
  options?: Partial<RoutingOptions>,
): Promise<DriveRoute | null> {
  return (await osrmRoutes(points, { ...options, alternatives: false }))[0] || null;
}

export async function planRoutes(
  points: LatLon[],
  options?: Partial<RoutingOptions>,
): Promise<DriveRoute[]> {
  if (points.length < 2) return [];
  const opts = { ...DEFAULT_ROUTING_OPTIONS, ...options };
  if (opts.profile === "scenic") {
    const scenic = await fetchValhalla(points, opts);
    if (scenic.length) return scenic;
  }
  try {
    const { googleRoutes } = await import("./groute");
    const google = await Promise.race([
      googleRoutes(points, opts),
      new Promise<DriveRoute[]>((resolve) => window.setTimeout(() => resolve([]), 5500)),
    ]);
    if (google.length) return google;
  } catch {
    /* OSM fallback */
  }
  return osrmRoutes(points, opts);
}

export async function planRoute(
  points: LatLon[],
  options?: Partial<RoutingOptions>,
): Promise<DriveRoute | null> {
  return (await planRoutes(points, { ...options, alternatives: false }))[0] || null;
}

export async function osrmDrive(points: LatLon[]): Promise<[number, number][]> {
  const r = await osrmRoute(points);
  if (r?.geometry.length) return r.geometry;
  return points.map((p) => [p.lat, p.lon]);
}

export function formatDriveTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d} d. ${h} h.` : `${d} d.`;
  if (h > 0) return m > 0 ? `${h} h. ${m} min.` : `${h} h.`;
  if (s < 45) return "1 min.";
  return `${Math.max(1, m)} min.`;
}

export function formatArrival(sec: number): string {
  const at = new Date(Date.now() + Math.max(0, sec) * 1000);
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `Arrival: ${time}, ${date}`;
}

export function formatMeters(meters: number): string {
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${km.toFixed(2)} km`;
}

export function stepInstruction(step: NavStep | undefined): string {
  if (!step) return "Follow the route";
  if (step.type === "arrive") return "Arrive at destination";
  const name = step.name?.trim() || "";
  const mod = `${step.modifier || ""}`.toLowerCase();
  const type = `${step.type || ""}`.toLowerCase();
  let verb = "Continue";
  if (mod.includes("uturn") || mod.includes("u-turn")) verb = "Make a U-turn";
  else if (type.includes("roundabout") || type.includes("rotary")) verb = "Enter the roundabout";
  else if (mod.includes("sharp") && mod.includes("left")) verb = "Turn sharp left";
  else if (mod.includes("sharp") && mod.includes("right")) verb = "Turn sharp right";
  else if (mod.includes("slight") && mod.includes("left")) verb = "Keep left";
  else if (mod.includes("slight") && mod.includes("right")) verb = "Keep right";
  else if (mod.includes("left")) verb = "Turn left";
  else if (mod.includes("right")) verb = "Turn right";
  else if (type === "merge") verb = "Merge";
  else if (type === "depart") verb = name ? "Head out" : "Head toward the route";
  if (!name) return verb === "Continue" ? "Continue straight" : verb;
  if (verb === "Continue") return `Continue on ${name}`;
  if (verb === "Head out") return `Head out on ${name}`;
  return `${verb} onto ${name}`;
}

/**
 * Upcoming maneuvers for the HUD. The first entry is the turn the rider is
 * approaching (reached in `stepRemain` meters); later entries follow it, each
 * with the leg length that separates it from the previous maneuver.
 */
export function maneuverPreviews(
  route: DriveRoute,
  stepI: number,
  stepRemain: number,
  count = 3,
): ManeuverPreview[] {
  const steps = route.steps;
  if (!steps.length) return [];
  const base = Math.max(0, Math.min(stepI, steps.length - 1));
  let distance = Math.max(0, stepRemain);
  let index = base + 1;
  if (index >= steps.length) {
    const last = steps[steps.length - 1];
    return [{ step: last, label: stepInstruction(last), distance }];
  }
  const list: ManeuverPreview[] = [];
  while (index < steps.length && list.length < count) {
    const step = steps[index];
    list.push({ step, label: stepInstruction(step), distance });
    distance = Math.max(0, step.distance);
    index += 1;
  }
  return list;
}

export function stepToward(step: NavStep | undefined): string {
  if (!step) return "toward destination";
  if (step.type === "arrive") return "Arrive";
  const name = step.name?.trim();
  return name ? `toward ${name}` : "toward destination";
}

export function stepThen(step: NavStep | undefined): { label: string; turn: string } | null {
  if (!step || step.type === "arrive") return null;
  const turn = step.modifier || step.type || "right";
  return { label: "Then", turn };
}

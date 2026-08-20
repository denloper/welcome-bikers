export type LatLon = { lat: number; lon: number };

export type NavStep = {
  name: string;
  distance: number;
  duration: number;
  type: string;
  modifier: string;
  location: [number, number];
};

export type DriveRoute = {
  geometry: [number, number][];
  distance: number;
  duration: number;
  steps: NavStep[];
};

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

async function fetchOsrm(host: string, points: LatLon[]): Promise<DriveRoute | null> {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const q = new URLSearchParams({ overview: "full", geometries: "geojson", steps: "true" });
  try {
    const res = await fetch(`${host}${coords}?${q}`);
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmJson;
    const route = data.routes?.[0];
    const line = route?.geometry?.coordinates;
    if (!route || !line?.length) return null;
    return {
      geometry: line.map(([lon, lat]) => [lat, lon]),
      distance: route.distance,
      duration: route.duration,
      steps: stepsFromOsrm(route, points[0]),
    };
  } catch {
    return null;
  }
}

async function fetchValhalla(points: LatLon[], useTolls: boolean): Promise<DriveRoute | null> {
  try {
    const res = await fetch("https://valhalla1.openstreetmap.de/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: points.map((p) => ({ lat: p.lat, lon: p.lon })),
        costing: "auto",
        costing_options: { auto: { use_tolls: useTolls ? 1 : 0 } },
      }),
    });
    if (!res.ok) return null;
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
    if (geometry.length < 2) return null;
    const summary = data.trip?.summary;
    return {
      geometry,
      distance: (summary?.length || 0) * 1000 || geometry.length,
      duration: summary?.time || 0,
      steps,
    };
  } catch {
    return null;
  }
}

export async function osrmRoute(
  points: LatLon[],
  opts?: { excludeToll?: boolean },
): Promise<DriveRoute | null> {
  if (points.length < 2) return null;
  const avoidTolls = Boolean(opts?.excludeToll);
  if (avoidTolls) {
    const avoided = await fetchValhalla(points, false);
    if (avoided) return avoided;
  }
  for (const host of OSRM_HOSTS) {
    const r = await fetchOsrm(host, points);
    if (r) return r;
  }
  return fetchValhalla(points, !avoidTolls);
}

export async function planRoute(
  points: LatLon[],
  opts?: { excludeToll?: boolean },
): Promise<DriveRoute | null> {
  try {
    const { googleRoute } = await import("./groute");
    const g = await Promise.race([
      googleRoute(points, opts),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5500)),
    ]);
    if (g) return g;
  } catch {
    /* OSM fallback */
  }
  return osrmRoute(points, opts);
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

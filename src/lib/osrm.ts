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

export async function osrmRoute(
  points: LatLon[],
  opts?: { excludeToll?: boolean },
): Promise<DriveRoute | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const q = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "true",
  });
  if (opts?.excludeToll) q.set("exclude", "toll");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?${q}`;
  try {
    const res = await fetch(url);
    const data = (await res.json()) as OsrmJson;
    const route = data.routes?.[0];
    const line = route?.geometry?.coordinates;
    if (!route || !line?.length) return null;
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
          location: loc ? [loc[1], loc[0]] : [points[0].lat, points[0].lon],
        });
      }
    }
    return {
      geometry: line.map(([lon, lat]) => [lat, lon]),
      distance: route.distance,
      duration: route.duration,
      steps,
    };
  } catch {
    return null;
  }
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

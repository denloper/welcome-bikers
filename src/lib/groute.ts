import { loadGoogle } from "./wbmap-gmaps";
import {
  DEFAULT_ROUTING_OPTIONS,
  type DriveRoute,
  type LatLon,
  type NavStep,
  type RoutingOptions,
} from "./routing-types";

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function streetName(step: google.maps.DirectionsStep) {
  const raw = stripHtml(step.instructions || "");
  const onto = raw.match(/\bonto\s+(.+?)(?:$|[.])/i) || raw.match(/\bon\s+(.+?)(?:$|[.])/i);
  if (onto?.[1]) return onto[1].trim();
  return raw.slice(0, 48);
}

function modifierFrom(maneuver: string) {
  const m = maneuver.toLowerCase();
  if (m.includes("uturn") || m.includes("u-turn")) return "uturn";
  if (m.includes("sharp-left") || m.includes("sharp_left")) return "sharp left";
  if (m.includes("sharp-right")) return "sharp right";
  if (m.includes("slight-left") || m.includes("keep-left")) return "slight left";
  if (m.includes("slight-right") || m.includes("keep-right")) return "slight right";
  if (m.includes("left")) return "left";
  if (m.includes("right")) return "right";
  return "straight";
}

function fromGoogleRoute(
  route: google.maps.DirectionsRoute,
  index: number,
  opts: RoutingOptions,
): DriveRoute | null {
  const geometry: [number, number][] = [];
  const steps: NavStep[] = [];
  let trafficAware = false;
  for (const leg of route.legs || []) {
    if ((leg as google.maps.DirectionsLeg & { duration_in_traffic?: google.maps.Duration }).duration_in_traffic) {
      trafficAware = true;
    }
    for (const step of leg.steps || []) {
      const path = step.path || [];
      for (const p of path) geometry.push([p.lat(), p.lng()]);
      const man = String(step.maneuver || "");
      const dur = step.duration?.value || 0;
      steps.push({
        name: streetName(step),
        distance: step.distance?.value || 0,
        duration: dur,
        type: man.includes("roundabout") ? "roundabout" : man ? "turn" : "straight",
        modifier: modifierFrom(man),
        location: [step.start_location.lat(), step.start_location.lng()],
      });
    }
  }
  if (geometry.length < 2) {
    for (const p of route.overview_path || []) geometry.push([p.lat(), p.lng()]);
  }
  if (geometry.length < 2) return null;
  const distance = (route.legs || []).reduce((s, l) => s + (l.distance?.value || 0), 0);
  const duration = (route.legs || []).reduce((s, l) => {
    const traffic = (l as google.maps.DirectionsLeg & { duration_in_traffic?: google.maps.Duration }).duration_in_traffic;
    return s + (traffic?.value || l.duration?.value || 0);
  }, 0);
  return {
    id: `google-${index}-${Math.round(distance)}-${Math.round(duration)}`,
    provider: "google",
    profile: opts.profile,
    trafficAware,
    summary: route.summary?.trim() || `Route ${index + 1}`,
    geometry,
    distance,
    duration,
    steps,
  };
}

function ask(svc: google.maps.DirectionsService, req: google.maps.DirectionsRequest) {
  return new Promise<google.maps.DirectionsResult>((resolve, reject) => {
    svc.route(req, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK && result) resolve(result);
      else reject(new Error(String(status)));
    });
  });
}

export async function googleRoutes(
  points: LatLon[],
  options?: Partial<RoutingOptions>,
): Promise<DriveRoute[]> {
  if (points.length < 2) return [];
  const opts = { ...DEFAULT_ROUTING_OPTIONS, ...options };
  await loadGoogle();
  const svc = new google.maps.DirectionsService();
  const origin = { lat: points[0].lat, lng: points[0].lon };
  const destination = { lat: points[points.length - 1].lat, lng: points[points.length - 1].lon };
  const waypoints = points.slice(1, -1).slice(0, 25).map((p) => ({
    location: { lat: p.lat, lng: p.lon },
    stopover: true,
  }));
  const alternatives = opts.alternatives !== false && waypoints.length === 0;
  const req: google.maps.DirectionsRequest = {
    origin,
    destination,
    waypoints,
    travelMode: google.maps.TravelMode.DRIVING,
    avoidTolls: !opts.allowTolls,
    avoidFerries: !opts.allowFerries,
    avoidHighways: opts.profile === "no-highways" || opts.profile === "scenic",
    provideRouteAlternatives: alternatives,
  };
  if (waypoints.length === 0) {
    req.drivingOptions = {
      departureTime: new Date(),
      trafficModel: google.maps.TrafficModel.BEST_GUESS,
    };
  }
  const parse = (result: google.maps.DirectionsResult) =>
    (result.routes || [])
      .slice(0, alternatives ? 3 : 1)
      .map((route, index) => fromGoogleRoute(route, index, opts))
      .filter((route): route is DriveRoute => Boolean(route));
  try {
    const res = await ask(svc, req);
    return parse(res);
  } catch {
    delete req.drivingOptions;
    try {
      const res = await ask(svc, req);
      return parse(res);
    } catch {
      return [];
    }
  }
}

export async function googleRoute(
  points: LatLon[],
  options?: Partial<RoutingOptions>,
): Promise<DriveRoute | null> {
  return (await googleRoutes(points, { ...options, alternatives: false }))[0] || null;
}

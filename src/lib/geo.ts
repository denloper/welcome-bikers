export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const q =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      s2 *
      s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function googleRouteUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
}

export function googleMultiRouteUrl(points: { lat: number; lon: number }[]): string {
  const pts = points.filter((p) => validCoords(p.lat, p.lon));
  if (!pts.length) return "https://www.google.com/maps";
  if (pts.length === 1) return googleRouteUrl(pts[0].lat, pts[0].lon);
  const origin = `${pts[0].lat},${pts[0].lon}`;
  const dest = `${pts[pts.length - 1].lat},${pts[pts.length - 1].lon}`;
  const wps = pts
    .slice(1, -1)
    .map((p) => `${p.lat},${p.lon}`)
    .join("|");
  const q = new URLSearchParams({
    api: "1",
    origin,
    destination: dest,
    travelmode: "driving",
  });
  if (wps) q.set("waypoints", wps);
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

export function appleMapsUrl(lat: number, lon: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;
}

export function wazeUrl(lat: number, lon: number): string {
  return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
}

export function validCoords(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export function bearingDeg(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function nearestIndex(
  pts: [number, number][],
  here: { lat: number; lon: number },
): number {
  let bestI = 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const km = haversineKm(here, { lat: pts[i][0], lon: pts[i][1] });
    if (km < best) {
      best = km;
      bestI = i;
    }
  }
  return bestI;
}

export function pointAhead(
  pts: [number, number][],
  here: { lat: number; lon: number },
  meters: number,
): { lat: number; lon: number } {
  if (!pts.length) return here;
  let i = nearestIndex(pts, here);
  let left = meters / 1000;
  while (i < pts.length - 1 && left > 0) {
    const a = { lat: pts[i][0], lon: pts[i][1] };
    const b = { lat: pts[i + 1][0], lon: pts[i + 1][1] };
    const d = haversineKm(a, b);
    if (d >= left || i === pts.length - 2) return b;
    left -= d;
    i += 1;
  }
  const last = pts[pts.length - 1];
  return { lat: last[0], lon: last[1] };
}

export async function osrmDrive(
  points: { lat: number; lon: number }[],
): Promise<[number, number][]> {
  if (points.length < 2) return points.map((p) => [p.lat, p.lon]);
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const data = (await res.json()) as {
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const line = data.routes?.[0]?.geometry?.coordinates;
    if (line?.length) return line.map(([lon, lat]) => [lat, lon]);
  } catch {
    /* fallback */
  }
  return points.map((p) => [p.lat, p.lon]);
}

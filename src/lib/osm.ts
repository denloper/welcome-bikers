import L from "leaflet";

const DARK =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const FALLBACK = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function darkTiles() {
  return L.tileLayer(DARK, {
    attribution: "&copy; OpenStreetMap, Carto",
    maxZoom: 20,
    subdomains: "abcd",
  });
}

export function osmTiles() {
  return L.tileLayer(FALLBACK, {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
  });
}

export function satTiles() {
  return L.tileLayer(SAT, { attribution: "Esri", maxZoom: 19 });
}

export function addDarkTiles(map: L.Map, hold?: { current: L.TileLayer | null }) {
  const dark = darkTiles();
  let swapped = false;
  dark.on("tileerror", () => {
    if (swapped) return;
    swapped = true;
    const osm = osmTiles();
    map.removeLayer(dark);
    osm.addTo(map);
    if (hold) hold.current = osm;
  });
  dark.addTo(map);
  if (hold) hold.current = dark;
  return dark;
}

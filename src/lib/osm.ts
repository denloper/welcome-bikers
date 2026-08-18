import L from "leaflet";

const LAYERS = [
  {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    opts: { attribution: "&copy; OpenStreetMap, Carto", maxZoom: 20, subdomains: "abcd" },
  },
  {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    opts: { attribution: "&copy; OpenStreetMap", maxZoom: 19 },
  },
  {
    url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
    opts: { attribution: "&copy; OpenStreetMap", maxZoom: 19 },
  },
  {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    opts: { attribution: "Esri", maxZoom: 16 },
  },
];
const SAT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function darkTiles(index = 0) {
  const layer = LAYERS[index] ?? LAYERS[0];
  return L.tileLayer(layer.url, layer.opts);
}

export function osmTiles() {
  return darkTiles(1);
}

export function satTiles() {
  return L.tileLayer(SAT, { attribution: "Esri", maxZoom: 19 });
}

export function addDarkTiles(map: L.Map, hold?: { current: L.TileLayer | null }) {
  let index = 0;
  let current = darkTiles(0);
  const attach = (layer: L.TileLayer) => {
    layer.on("tileerror", () => {
      if (index >= LAYERS.length - 1) return;
      index += 1;
      map.removeLayer(layer);
      const next = darkTiles(index);
      attach(next);
      next.addTo(map);
      current = next;
      if (hold) hold.current = next;
    });
  };
  attach(current);
  current.addTo(map);
  if (hold) hold.current = current;
  return current;
}

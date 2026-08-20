import { GeoJSONSource, Map, Marker } from "maplibre-gl";
import type { EaseToOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export const NAV_TILT = 45;
export const NAV_ZOOM = 17;

const ARROW = `<span class="wb-gl-me"><svg viewBox="0 0 24 32" width="28" height="36"><path d="M12 2 L22 30 L12 23 L2 30 Z" fill="#3DADF3" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></span>`;

function rasterFallback(dark: boolean) {
  const url = dark
    ? "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    : "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
  return {
    version: 8 as const,
    sources: {
      carto: {
        type: "raster" as const,
        tiles: [url],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap, Carto",
      },
    },
    layers: [{ id: "carto", type: "raster" as const, source: "carto" }],
  };
}

function routeGeo(route: [number, number][]) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: route.map(([lat, lon]) => [lon, lat]),
        },
      },
    ],
  };
}

function addBuildings(map: Map) {
  if (map.getLayer("wb-3d-buildings")) return;
  if (!map.getSource("openmaptiles")) return;
  try {
    for (const layer of map.getStyle().layers || []) {
      if (layer.type === "fill" && /building/i.test(layer.id)) {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
    map.addLayer({
      id: "wb-3d-buildings",
      source: "openmaptiles",
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#c4c1b6",
        "fill-extrusion-height": [
          "coalesce",
          ["get", "render_height"],
          ["get", "height"],
          8,
        ],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.85,
      },
    });
  } catch {
    /* style without buildings */
  }
}

function addRoute(map: Map, route: [number, number][], dark: boolean) {
  const data = routeGeo(route);
  const line = dark ? "#FFFF00" : "#0033FF";
  const border = dark ? "#FFCC00" : "#000099";
  if (map.getSource("wb-route")) {
    (map.getSource("wb-route") as GeoJSONSource).setData(data);
    return;
  }
  map.addSource("wb-route", { type: "geojson", data });
  map.addLayer({
    id: "wb-route-border",
    type: "line",
    source: "wb-route",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": border, "line-width": 10, "line-opacity": 1 },
  });
  map.addLayer({
    id: "wb-route-line",
    type: "line",
    source: "wb-route",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": line, "line-width": 5, "line-opacity": 0.85 },
  });
}

function decorate(map: Map, route: [number, number][], dark: boolean) {
  addBuildings(map);
  if (route.length >= 2) addRoute(map, route, dark);
}

export function createNavMap(
  el: HTMLElement,
  opts: {
    lon: number;
    lat: number;
    bearing?: number;
    dark?: boolean;
    route: [number, number][];
  },
) {
  const dark = Boolean(opts.dark);
  el.dataset.pitch = String(NAV_TILT);
  const map = new Map({
    container: el,
    style: rasterFallback(dark),
    center: [opts.lon, opts.lat],
    zoom: NAV_ZOOM,
    pitch: NAV_TILT,
    bearing: opts.bearing ?? 0,
    attributionControl: false,
    fadeDuration: 0,
    dragRotate: true,
    pitchWithRotate: false,
    touchPitch: false,
    minPitch: NAV_TILT,
    maxPitch: NAV_TILT,
    minZoom: 14,
    maxZoom: 20,
  });
  const paint = () => {
    decorate(map, opts.route, dark);
    el.dataset.ready = "1";
    if (map.getSource("openmaptiles")) return;
    try {
      map.addSource("openmaptiles", {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
      });
      addBuildings(map);
    } catch {
      /* raster-only 3D is still tilted 45° */
    }
  };
  map.once("load", paint);
  requestAnimationFrame(() => map.resize());
  window.setTimeout(() => map.resize(), 120);
  window.setTimeout(() => map.resize(), 500);
  const marker = new Marker({ element: markerEl(), anchor: "center" }).setLngLat([opts.lon, opts.lat]).addTo(map);
  (map as NavMap)._wbMarker = marker;
  (map as NavMap)._wbDark = dark;
  (map as NavMap)._wbRoute = opts.route;
  return map as NavMap;
}

type NavMap = Map & {
  _wbMarker?: Marker;
  _wbDark?: boolean;
  _wbRoute?: [number, number][];
};

function markerEl() {
  const el = document.createElement("div");
  el.innerHTML = ARROW;
  return el.firstElementChild as HTMLElement;
}

export function followNav(
  map: Map,
  opts: { lon: number; lat: number; bearing?: number | null },
) {
  const nmap = map as NavMap;
  nmap._wbMarker?.setLngLat([opts.lon, opts.lat]);
  const cam: EaseToOptions = {
    center: [opts.lon, opts.lat],
    pitch: NAV_TILT,
    duration: 350,
    essential: true,
  };
  if (opts.bearing != null && Number.isFinite(opts.bearing)) cam.bearing = opts.bearing;
  if (map.getZoom() < NAV_ZOOM) cam.zoom = NAV_ZOOM;
  map.easeTo(cam);
}

export function setNavTheme(map: Map, dark: boolean, route: [number, number][]) {
  const nmap = map as NavMap;
  nmap._wbDark = dark;
  nmap._wbRoute = route;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing();
  map.setStyle(rasterFallback(dark));
  map.once("load", () => {
    map.jumpTo({ center, zoom, bearing, pitch: NAV_TILT });
    decorate(map, route, dark);
    try {
      map.addSource("openmaptiles", {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
      });
      addBuildings(map);
    } catch {
      /* keep tilted raster */
    }
    nmap._wbMarker?.addTo(map);
  });
}

export function navZoom(map: Map, dir: 1 | -1) {
  map.easeTo({ zoom: map.getZoom() + dir, pitch: NAV_TILT, duration: 200, essential: true });
}

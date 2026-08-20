import { GeoJSONSource, Map as MapLibreMap, Marker, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { asset } from "./assets";
import type { Place, PlaceType } from "../types";
import { HOME, HOME_ZOOM, NAV_TILT, NAV_ZOOM, type MapKind, type WbMap } from "./wbmap-types";

setWorkerUrl(workerUrl);

const PIN_TYPES: PlaceType[] = [
  "hotels",
  "shops",
  "bars",
  "restaurants",
  "services",
  "rent",
  "festivals",
  "viewpoints",
  "historical",
];
const TONES = ["friendly", "black", "white"] as const;
const pinCache: Record<string, ImageData> = {};

const ARROW = `<span class="wb-gl-me"><svg viewBox="0 0 24 32" width="28" height="36"><path d="M12 2 L22 30 L12 23 L2 30 Z" fill="#3DADF3" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></span>`;

function vectorStyle(dark: boolean) {
  return dark ? "https://tiles.openfreemap.org/styles/dark" : "https://tiles.openfreemap.org/styles/liberty";
}

function rasterStyle(dark: boolean) {
  const url = dark
    ? "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    : "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
  return {
    version: 8 as const,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      carto: { type: "raster" as const, tiles: [url], tileSize: 256 },
    },
    layers: [{ id: "carto", type: "raster" as const, source: "carto" }],
  };
}

function satStyle() {
  return {
    version: 8 as const,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      sat: {
        type: "raster" as const,
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
      },
    },
    layers: [{ id: "sat", type: "raster" as const, source: "sat" }],
  };
}

function kindStyle(kind: MapKind) {
  if (kind === "satellite") return satStyle();
  if (kind === "vector-dark") return vectorStyle(true);
  return vectorStyle(false);
}

function sanitizeStyle(style: StyleSpecification) {
  for (const layer of style.layers || []) {
    const paint = "paint" in layer ? layer.paint : undefined;
    if (paint && "fill-pattern" in paint) {
      delete (paint as { "fill-pattern"?: unknown })["fill-pattern"];
    }
  }
  return style;
}

const STYLE_OPTS = {
  diff: false as const,
  transformStyle(_prev: StyleSpecification | undefined, next: StyleSpecification) {
    return sanitizeStyle(next);
  },
};

function placesFc(places: Place[], darkPins: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: places
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        properties: {
          id: String(p.id),
          name: p.name,
          type: p.types[0] || "hotels",
          icon: `pin-${p.bikersFriendly ? "friendly" : darkPins ? "white" : "black"}-${p.types[0] || "hotels"}`,
        },
      })),
  };
}

function routeFc(pts: [number, number][]) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: pts.map(([lat, lon]) => [lon, lat]),
        },
      },
    ],
  };
}

async function rasterize(url: string, w: number, h: number) {
  const hit = pinCache[url];
  if (hit) return hit;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(url));
    el.src = url;
  });
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  pinCache[url] = data;
  return data;
}

async function loadPins(map: MapLibreMap) {
  await Promise.all(
    TONES.flatMap((tone) =>
      PIN_TYPES.map(async (type) => {
        const id = `pin-${tone}-${type}`;
        if (map.hasImage(id)) return;
        try {
          const data = await rasterize(asset(`pins/${tone}/${type}.svg`), 60, 80);
          if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: 2 });
        } catch {
          /* skip missing pin */
        }
      }),
    ),
  );
}

function addBuildings(map: MapLibreMap, dark: boolean) {
  if (map.getLayer("wb-3d-buildings") || !map.getSource("openmaptiles")) return;
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
        "fill-extrusion-color": dark ? "#2a2a2a" : "#c4c1b6",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.82,
      },
    });
  } catch {
    /* no buildings */
  }
}

function paintRoute(map: MapLibreMap, dark: boolean) {
  if (!map.getLayer("wb-route-line")) return;
  map.setPaintProperty("wb-route-line", "line-color", dark ? "#FFFF00" : "#0033FF");
  map.setPaintProperty("wb-route-border", "line-color", dark ? "#FFCC00" : "#000099");
}

function addOverlays(map: MapLibreMap, routeDark: boolean) {
  if (!map.getSource("wb-places")) {
    map.addSource("wb-places", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 11,
      clusterRadius: 100,
    });
    map.addLayer({
      id: "wb-clusters",
      type: "circle",
      source: "wb-places",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ["step", ["get", "point_count"], "#4da3ff", 20, "#e10600"],
        "circle-radius": ["step", ["get", "point_count"], 16, 20, 22, 50, 28],
        "circle-stroke-width": 3,
        "circle-stroke-color": ["step", ["get", "point_count"], "rgba(77,163,255,.35)", 20, "rgba(225,6,0,.35)"],
      },
    });
    try {
      map.addLayer({
        id: "wb-cluster-count",
        type: "symbol",
        source: "wb-places",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Noto Sans Regular"],
        },
        paint: { "text-color": "#fff" },
      });
    } catch {
      /* glyphs unavailable */
    }
    map.addLayer({
      id: "wb-pins",
      type: "symbol",
      source: "wb-places",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": 1,
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
  if (!map.getSource("wb-route")) {
    map.addSource("wb-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "wb-route-border",
      type: "line",
      source: "wb-route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#000099",
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 6, 16, 10],
      },
    });
    map.addLayer({
      id: "wb-route-line",
      type: "line",
      source: "wb-route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#0033FF",
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.5, 10, 3, 16, 5],
        "line-opacity": 0.85,
      },
    });
  }
  paintRoute(map, routeDark);
  addBuildings(map, routeDark);
}

function setPinVisibility(map: MapLibreMap, show: boolean) {
  const vis = show ? "visible" : "none";
  for (const id of ["wb-clusters", "wb-cluster-count", "wb-pins"]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}

export function createLibreMap(
  el: HTMLElement,
  opts: {
    onPlace?: (id: string) => void;
    onMap?: (lat: number, lon: number) => void;
  },
): WbMap {
  el.dataset.pitch = "0";
  el.dataset.kind = "vector-light";
  el.dataset.zoom = String(HOME_ZOOM);
  const map = new MapLibreMap({
    container: el,
    style: kindStyle("vector-light"),
    center: [HOME.lng, HOME.lat],
    zoom: HOME_ZOOM,
    pitch: 0,
    bearing: 0,
    attributionControl: false,
    maplibreLogo: false,
    fadeDuration: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    minPitch: 0,
    maxPitch: 60,
    hash: false,
  });
  try {
    map.touchZoomRotate.disableRotation();
  } catch {
    /* handler not ready */
  }

  let alive = true;
  let booted = false;
  let navOn = false;
  let pickOn = false;
  let kind: MapKind = "vector-light";
  let marker: Marker | null = null;
  let lastPlaces: Place[] = [];
  let lastDarkPins = false;
  let lastRoute: [number, number][] = [];
  let lastRouteDark = false;
  let pendingFit = false;
  let pendingView: { center: [number, number]; zoom: number; bearing: number; pitch: number } | null = null;
  let styleTimer = 0;
  let paintGen = 0;
  let styleGen = 0;

  const clearStyleTimer = () => {
    if (styleTimer) {
      window.clearTimeout(styleTimer);
      styleTimer = 0;
    }
  };

  const fallbackRaster = () => {
    if (!alive || kind === "satellite") return;
    map.setStyle(rasterStyle(kind === "vector-dark"), STYLE_OPTS);
  };

  const applyStyle = (style: string | StyleSpecification) => {
    const gen = ++styleGen;
    clearStyleTimer();
    styleTimer = window.setTimeout(() => {
      if (!alive || gen !== styleGen) return;
      fallbackRaster();
    }, 6000);
    map.setStyle(style, STYLE_OPTS);
  };

  const arrow = () => {
    if (marker) return marker;
    const node = document.createElement("div");
    node.innerHTML = ARROW;
    marker = new Marker({ element: node.firstElementChild as HTMLElement, anchor: "center" });
    return marker;
  };

  const applyCamera = () => {
    if (navOn) {
      map.setMinPitch(0);
      map.setMaxPitch(60);
      try {
        map.dragRotate.enable();
        map.touchZoomRotate.enableRotation();
      } catch {
        /* ignore */
      }
      map.jumpTo({ pitch: NAV_TILT, zoom: Math.max(map.getZoom(), NAV_ZOOM) });
      el.dataset.pitch = String(NAV_TILT);
    } else {
      try {
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
      } catch {
        /* ignore */
      }
      map.jumpTo({ pitch: 0, bearing: 0 });
      el.dataset.pitch = "0";
    }
  };

  const fitRoute = (pts: [number, number][]) => {
    if (pts.length < 2 || navOn) return;
    const b = pts.reduce(
      (acc, [lat, lon]) => {
        acc.minLat = Math.min(acc.minLat, lat);
        acc.maxLat = Math.max(acc.maxLat, lat);
        acc.minLon = Math.min(acc.minLon, lon);
        acc.maxLon = Math.max(acc.maxLon, lon);
        return acc;
      },
      { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 },
    );
    try {
      map.fitBounds(
        [
          [b.minLon, b.minLat],
          [b.maxLon, b.maxLat],
        ],
        { padding: { top: 130, bottom: 240, left: 28, right: 56 }, duration: 400, pitch: 0, bearing: 0 },
      );
      pendingFit = false;
    } catch {
      pendingFit = true;
    }
  };

  const paint = async () => {
    const gen = ++paintGen;
    if (!alive) return;
    try {
      await loadPins(map);
    } catch {
      /* pins optional */
    }
    if (!alive || gen !== paintGen) return;
    try {
      addOverlays(map, lastRouteDark);
      if (lastPlaces.length) {
        (map.getSource("wb-places") as GeoJSONSource | undefined)?.setData(placesFc(lastPlaces, lastDarkPins));
      }
      if (lastRoute.length >= 2) {
        (map.getSource("wb-route") as GeoJSONSource | undefined)?.setData(routeFc(lastRoute));
        paintRoute(map, lastRouteDark);
      }
      setPinVisibility(map, !navOn && !pickOn);
      if (pendingView) {
        map.jumpTo(pendingView);
        pendingView = null;
      }
      if (pendingFit && lastRoute.length >= 2) fitRoute(lastRoute);
    } catch {
      /* style not ready */
    }
    if (gen !== paintGen) return;
    clearStyleTimer();
    booted = true;
    el.dataset.ready = "1";
    el.dataset.kind = kind;
    el.dataset.zoom = String(map.getZoom());
    if (navOn) applyCamera();
    else el.dataset.pitch = "0";
    map.resize();
  };

  map.on("style.load", () => {
    void paint();
  });
  map.on("load", () => {
    if (!booted) void paint();
  });
  map.on("zoom", () => {
    el.dataset.zoom = String(map.getZoom());
    el.dataset.kind = kind;
  });
  styleTimer = window.setTimeout(() => {
    if (!alive || booted || !el.isConnected || kind === "satellite") return;
    fallbackRaster();
  }, 8000);

  map.on("click", "wb-clusters", (e) => {
    const f = e.features?.[0];
    if (!f || f.properties?.cluster_id == null) return;
    const src = map.getSource("wb-places") as GeoJSONSource;
    const cid = Number(f.properties.cluster_id);
    src.getClusterExpansionZoom(cid).then((z) => {
      const geom = f.geometry as unknown as { coordinates: [number, number] };
      const coords = geom.coordinates;
      map.easeTo({ center: coords, zoom: z, duration: 350, pitch: navOn ? NAV_TILT : 0 });
    });
  });
  map.on("click", "wb-pins", (e) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    if (id) opts.onPlace?.(String(id));
  });
  map.on("click", (e) => {
    const layers = ["wb-pins", "wb-clusters"].filter((id) => map.getLayer(id));
    const box: [[number, number], [number, number]] = [
      [e.point.x - 24, e.point.y - 24],
      [e.point.x + 24, e.point.y + 24],
    ];
    if (layers.length) {
      const hits = map.queryRenderedFeatures(box, { layers });
      const pin = hits.find((f) => f.layer.id === "wb-pins");
      const cluster = hits.find((f) => f.layer.id === "wb-clusters");
      if (pin?.properties?.id) {
        opts.onPlace?.(String(pin.properties.id));
        return;
      }
      if (cluster?.properties?.cluster_id != null) {
        const src = map.getSource("wb-places") as GeoJSONSource;
        const cid = Number(cluster.properties.cluster_id);
        const geom = cluster.geometry as unknown as { coordinates: [number, number] };
        void src.getClusterExpansionZoom(cid).then((z) => {
          map.easeTo({ center: geom.coordinates, zoom: z, duration: 350, pitch: navOn ? NAV_TILT : 0 });
        });
        return;
      }
    }
    opts.onMap?.(e.lngLat.lat, e.lngLat.lng);
  });
  map.on("mouseenter", "wb-pins", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "wb-pins", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("mouseenter", "wb-clusters", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "wb-clusters", () => {
    map.getCanvas().style.cursor = "";
  });

  const resize = () => {
    if (!alive) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 8 || h < 8) return;
    map.resize();
  };
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  window.visualViewport?.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", resize);
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  if (el.parentElement) ro.observe(el.parentElement);
  const retries = [0, 50, 200, 500, 1200].map((ms) => window.setTimeout(resize, ms));

  const api: WbMap = {
    map,
    el,
    setPlaces(places, darkPins) {
      lastPlaces = places;
      lastDarkPins = darkPins;
      (map.getSource("wb-places") as GeoJSONSource | undefined)?.setData(placesFc(places, darkPins));
    },
    setRoute(pts, dark, extra) {
      lastRoute = pts;
      lastRouteDark = dark;
      (map.getSource("wb-route") as GeoJSONSource | undefined)?.setData(routeFc(pts));
      paintRoute(map, dark);
      if (extra?.fit && pts.length >= 2 && !navOn) {
        pendingFit = true;
        fitRoute(pts);
      }
    },
    clearRoute() {
      lastRoute = [];
      pendingFit = false;
      (map.getSource("wb-route") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
    },
    setNav(on) {
      navOn = on;
      setPinVisibility(map, !on && !pickOn);
      if (!on) marker?.remove();
      requestAnimationFrame(() => {
        resize();
        applyCamera();
      });
    },
    setPick(on) {
      pickOn = on;
      el.dataset.pick = on ? "1" : "0";
      setPinVisibility(map, !navOn && !on);
    },
    follow(lon, lat, bearing, look) {
      const cam: {
        center: [number, number];
        pitch: number;
        zoom?: number;
        bearing?: number;
        duration: number;
        essential: boolean;
      } = {
        center: [look?.lon ?? lon, look?.lat ?? lat],
        pitch: NAV_TILT,
        duration: 180,
        essential: true,
      };
      if (bearing != null && Number.isFinite(bearing)) cam.bearing = bearing;
      if (map.getZoom() < NAV_ZOOM) cam.zoom = NAV_ZOOM;
      map.easeTo(cam);
      arrow().setLngLat([lon, lat]).addTo(map);
      el.dataset.pitch = String(NAV_TILT);
    },
    setKind(next, overlays) {
      kind = next;
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = navOn ? NAV_TILT : 0;
      pendingView = { center: [center.lng, center.lat], zoom, bearing, pitch };
      if (overlays?.places) lastPlaces = overlays.places;
      if (overlays?.darkPins != null) {
        lastDarkPins = overlays.darkPins;
        lastRouteDark = overlays.darkPins;
      }
      if (overlays?.route) lastRoute = overlays.route;
      el.dataset.ready = "0";
      el.dataset.kind = next;
      applyStyle(kindStyle(next));
    },
    flyTo(lat, lon, zoom = 11) {
      map.easeTo({ center: [lon, lat], zoom, duration: 500, pitch: navOn ? NAV_TILT : 0 });
    },
    zoomBy(dir) {
      map.easeTo({ zoom: map.getZoom() + dir, duration: 200, pitch: navOn ? NAV_TILT : map.getPitch() });
    },
    tapAt(x, y) {
      if (navOn) return;
      const ll = map.unproject([x, y]);
      opts.onMap?.(ll.lat, ll.lng);
    },
    panBy(dx, dy) {
      map.panBy([dx, dy], { duration: 0 });
    },
    resize,
    remove() {
      alive = false;
      retries.forEach((id) => window.clearTimeout(id));
      clearStyleTimer();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resize);
      ro.disconnect();
      try {
        marker?.remove();
        map.remove();
      } catch {
        /* already torn down */
      }
    },
  };

  return api;
}

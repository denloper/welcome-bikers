import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { asset } from "./assets";
import type { Place } from "../types";
import { HOME, HOME_ZOOM, NAV_TILT, NAV_ZOOM, USER_PIN_HTML, type MapKind, type WbMap, type WbRouteLine } from "./wbmap-types";

const LIGHT_MAP_ID = "a7dbf0e5d7ceea8629f41e1e";
const DARK_MAP_ID = "a7dbf0e5d7ceea8614b0b9ae";

const ARROW = `<span class="wb-gl-me wb-garrow"><svg viewBox="0 0 24 32" width="28" height="36"><path d="M12 2 L22 30 L12 23 L2 30 Z" fill="#3DADF3" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></span>`;
const ME_STAR = USER_PIN_HTML;

let boot: Promise<void> | null = null;
let webglState: boolean | null = null;

/**
 * Remote-desktop and software-rendered environments often create a WebGL
 * context that only paints black. Google's built-in raster fallback never
 * fires there, leaving an empty void. Probe once: require a hardware context
 * and verify a clear actually produces the requested color.
 */
function webglHealthy(): boolean {
  if (webglState != null) return webglState;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const gl = (canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ||
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true })) as WebGLRenderingContext | null;
    if (!gl) {
      webglState = false;
      return false;
    }
    gl.clearColor(0, 0.5, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    webglState = px[2] > 100;
  } catch {
    webglState = false;
  }
  return webglState;
}

function mapsKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
}

export function loadGoogle() {
  const key = mapsKey();
  if (!key) return Promise.reject(new Error("no-gmaps-key"));
  if (!boot) {
    setOptions({ key, v: "weekly", mapIds: [LIGHT_MAP_ID, DARK_MAP_ID] });
    boot = Promise.all([
      importLibrary("maps"),
      importLibrary("marker"),
      importLibrary("routes").catch(() => undefined),
    ]).then(() => undefined);
  }
  return boot;
}

function mapIdFor(kind: MapKind) {
  return kind === "vector-dark" ? DARK_MAP_ID : LIGHT_MAP_ID;
}

function pinSrc(place: Place, darkPins: boolean) {
  const tone = place.bikersFriendly ? "friendly" : darkPins ? "white" : "black";
  const type = place.types[0] || "hotels";
  return asset(`pins/${tone}/${type}.svg`);
}

function onTap(node: HTMLElement, fn: () => void) {
  node.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
}

export async function createGoogleMap(
  el: HTMLElement,
  opts: {
    onPlace?: (id: string) => void;
    onMap?: (lat: number, lon: number) => void;
  },
): Promise<WbMap> {
  const boot = el.dataset.boot || "";
  await loadGoogle();
  if (!el.isConnected || el.dataset.engine === "dead" || (boot && el.dataset.boot !== boot)) {
    throw new Error("aborted");
  }
  if (el.dataset.engine && el.dataset.engine !== "pending") throw new Error("aborted");

  class PixelLayer extends google.maps.OverlayView {
    onAdd() {}
    draw() {}
    onRemove() {}
  }

  let alive = true;
  let navOn = false;
  let lastPlaces: Place[] = [];
  let lastDarkPins = false;
  let lastRoutes: WbRouteLine[] = [];
  let selectedRouteId: string | null = null;
  let lastRouteDark = false;
  let trafficOn = false;
  let pendingFit = false;
  let pickOn = false;
  let kind: MapKind = "vector-light";
  let idleGen = 0;
  let gmap: google.maps.Map;
  let clusterer: MarkerClusterer | null = null;
  let pinMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
  let routePolylines: google.maps.Polyline[] = [];
  let trafficLayer: google.maps.TrafficLayer | null = null;
  let arrow: google.maps.marker.AdvancedMarkerElement | null = null;
  let meMark: google.maps.marker.AdvancedMarkerElement | null = null;
  let lastMe: { lat: number; lon: number } | null = null;
  const listeners: google.maps.MapsEventListener[] = [];
  let lastPickAt = 0;
  let lastPlaceAt = 0;
  let lastPlaceId = "";
  let hitView: InstanceType<typeof PixelLayer> | null = null;

  const camera = () => ({
    center: gmap.getCenter()?.toJSON() || HOME,
    zoom: gmap.getZoom() ?? HOME_ZOOM,
    heading: gmap.getHeading() || 0,
    tilt: navOn ? NAV_TILT : gmap.getTilt() || 0,
  });

  const vectorOk = webglHealthy();

  const mapOptions = (next: MapKind, view = camera()): google.maps.MapOptions => ({
    center: view.center,
    zoom: view.zoom,
    heading: view.heading,
    tilt: navOn ? NAV_TILT : 0,
    disableDefaultUI: true,
    keyboardShortcuts: false,
    clickableIcons: false,
    draggable: true,
    gestureHandling: "greedy",
    headingInteractionEnabled: navOn && vectorOk,
    tiltInteractionEnabled: false,
    mapId: mapIdFor(next),
    mapTypeId: next === "satellite" ? "hybrid" : "roadmap",
    renderingType: vectorOk ? google.maps.RenderingType.VECTOR : google.maps.RenderingType.RASTER,
    isFractionalZoomEnabled: vectorOk,
    colorScheme: next === "vector-dark" ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT,
  });

  const clearOverlays = () => {
    clusterer?.clearMarkers();
    clusterer = null;
    pinMarkers = [];
    routePolylines.forEach((line) => line.setMap(null));
    routePolylines = [];
    trafficLayer?.setMap(null);
    trafficLayer = null;
    if (arrow) arrow.map = null;
  };

  const paintRoute = () => {
    routePolylines.forEach((line) => line.setMap(null));
    routePolylines = [];
    const ordered = [...lastRoutes].sort((a) => (a.id === selectedRouteId ? 1 : -1));
    for (const route of ordered) {
      if (route.points.length < 2) continue;
      const selected = route.id === selectedRouteId || (!selectedRouteId && route === ordered[ordered.length - 1]);
      const path = route.points.map(([lat, lon]) => ({ lat, lng: lon }));
      const border = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: lastRouteDark ? "#FFCC00" : "#000099",
        strokeOpacity: selected ? 1 : 0.26,
        strokeWeight: selected ? 9 : 6,
        map: gmap,
        clickable: false,
        zIndex: selected ? 3 : 1,
      });
      const line = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: lastRouteDark ? "#FFFF00" : "#0033FF",
        strokeOpacity: selected ? 0.8 : 0.32,
        strokeWeight: selected ? 4 : 3,
        map: gmap,
        clickable: false,
        zIndex: selected ? 4 : 2,
      });
      routePolylines.push(border, line);
    }
  };

  const fitRoute = () => {
    const route = lastRoutes.find((item) => item.id === selectedRouteId) || lastRoutes[0];
    if (!route || route.points.length < 2 || navOn) return;
    const bounds = new google.maps.LatLngBounds();
    route.points.forEach(([lat, lon]) => bounds.extend({ lat, lng: lon }));
    gmap.fitBounds(bounds, { top: 130, bottom: 240, left: 28, right: 56 });
    pendingFit = false;
  };

  const paintTraffic = () => {
    trafficLayer?.setMap(null);
    trafficLayer = null;
    if (!trafficOn) return;
    trafficLayer = new google.maps.TrafficLayer({ autoRefresh: true });
    trafficLayer.setMap(gmap);
  };

  const openPlace = (id: string) => {
    const now = Date.now();
    if (id === lastPlaceId && now - lastPlaceAt < 400) return;
    lastPlaceId = id;
    lastPlaceAt = now;
    opts.onPlace?.(id);
  };

  const paintPlaces = () => {
    clusterer?.clearMarkers();
    clusterer = null;
    pinMarkers = [];
    if (navOn || pickOn) return;
    const Advanced = google.maps.marker.AdvancedMarkerElement;
    pinMarkers = lastPlaces
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => {
        const img = document.createElement("img");
        img.src = pinSrc(p, lastDarkPins);
        img.width = 30;
        img.height = 40;
        img.alt = "";
        img.className = "wb-gpin";
        img.draggable = false;
        const hit = document.createElement("button");
        hit.type = "button";
        hit.className = "wb-gpin-hit";
        hit.setAttribute("aria-label", p.name);
        hit.appendChild(img);
        onTap(hit, () => openPlace(String(p.id)));
        const marker = new Advanced({
          position: { lat: p.lat, lng: p.lon },
          content: hit,
          title: p.name,
          gmpClickable: true,
        });
        marker.addEventListener("gmp-click", () => openPlace(String(p.id)));
        return marker;
      });
    clusterer = new MarkerClusterer({
      map: gmap,
      markers: pinMarkers,
      algorithm: new SuperClusterAlgorithm({ maxZoom: 11, radius: 100 }),
      onClusterClick: (_e, cluster, map) => {
        if (cluster.bounds) {
          map.fitBounds(cluster.bounds, 48);
          return;
        }
        const z = map.getZoom() ?? HOME_ZOOM;
        map.moveCamera({ center: cluster.position, zoom: Math.min(z + 2, 16) });
      },
      renderer: {
        render({ count, position }) {
          const big = count >= 20;
          const node = document.createElement("button");
          node.type = "button";
          node.className = `wb-gcluster${big ? " big" : ""}`;
          node.textContent = String(count);
          node.setAttribute("aria-label", `${count} places`);
          onTap(node, () => {
            const z = gmap.getZoom() ?? HOME_ZOOM;
            gmap.moveCamera({ center: position, zoom: Math.min(z + 2, 16) });
          });
          return new Advanced({
            position,
            content: node,
            gmpClickable: true,
            zIndex: 1000 + count,
          });
        },
      },
    });
  };

  const makeArrow = () => {
    if (arrow) return arrow;
    const node = document.createElement("div");
    node.innerHTML = ARROW;
    arrow = new google.maps.marker.AdvancedMarkerElement({
      content: node.firstElementChild as HTMLElement,
      zIndex: 999999,
    });
    return arrow;
  };

  const paintMe = () => {
    if (navOn || !lastMe) {
      if (meMark) meMark.map = null;
      return;
    }
    if (!meMark) {
      const node = document.createElement("div");
      node.innerHTML = ME_STAR;
      meMark = new google.maps.marker.AdvancedMarkerElement({
        content: node.firstElementChild as HTMLElement,
        zIndex: 500000,
        gmpClickable: false,
      });
    }
    meMark.position = { lat: lastMe.lat, lng: lastMe.lon };
    meMark.map = gmap;
  };

  const applyNavCamera = () => {
    gmap.setOptions({ headingInteractionEnabled: navOn && vectorOk, tiltInteractionEnabled: false });
    if (navOn) {
      gmap.setTilt(NAV_TILT);
      if ((gmap.getZoom() ?? 0) < NAV_ZOOM) gmap.setZoom(NAV_ZOOM);
      el.dataset.pitch = String(NAV_TILT);
    } else {
      gmap.setTilt(0);
      gmap.setHeading(0);
      el.dataset.pitch = "0";
    }
  };

  const latLngAt = (x: number, y: number) => {
    const b = gmap.getBounds();
    if (!b || el.clientWidth < 8 || el.clientHeight < 8) return null;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    const lng = sw.lng() + (x / el.clientWidth) * (ne.lng() - sw.lng());
    const north = Math.log(Math.tan(Math.PI / 4 + (ne.lat() * Math.PI) / 360));
    const south = Math.log(Math.tan(Math.PI / 4 + (sw.lat() * Math.PI) / 360));
    const merc = north - (y / el.clientHeight) * (north - south);
    const lat = ((2 * Math.atan(Math.exp(merc)) - Math.PI / 2) * 180) / Math.PI;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  const emitMap = (lat: number, lon: number) => {
    if (navOn) return;
    const now = Date.now();
    if (now - lastPickAt < 400) return;
    lastPickAt = now;
    opts.onMap?.(lat, lon);
  };

  const placeNearPixel = (x: number, y: number) => {
    const proj = hitView?.getProjection();
    if (!proj || (gmap.getZoom() ?? 0) < 11) return null;
    let best: Place | null = null;
    let bestD = 48 * 48;
    for (const p of lastPlaces) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      const pix = proj.fromLatLngToContainerPixel(new google.maps.LatLng(p.lat, p.lon));
      if (!pix) continue;
      const d = (pix.x - x) ** 2 + (pix.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };

  const pixelToLatLng = (x: number, y: number) => {
    const proj = hitView?.getProjection();
    if (proj) {
      const ll = proj.fromContainerPixelToLatLng(new google.maps.Point(x, y));
      if (ll) return { lat: ll.lat(), lng: ll.lng() };
    }
    return latLngAt(x, y);
  };

  const bind = () => {
    listeners.splice(0).forEach((l) => l.remove());
    listeners.push(
      gmap.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (navOn || !e.latLng) return;
        if (pickOn) {
          emitMap(e.latLng.lat(), e.latLng.lng());
          return;
        }
        const proj = hitView?.getProjection();
        const pt = proj?.fromLatLngToContainerPixel(e.latLng);
        const hit = pt ? placeNearPixel(pt.x, pt.y) : null;
        if (hit) openPlace(String(hit.id));
      }),
      gmap.addListener("zoom_changed", () => {
        el.dataset.zoom = String(gmap.getZoom() ?? HOME_ZOOM);
      }),
    );
  };

  const attachHitView = () => {
    hitView?.setMap(null);
    hitView = new PixelLayer();
    hitView.setMap(gmap);
  };

  const keepHost = () => {
    el.classList.add("map-wrap", "full", "map-gl");
    el.dataset.kind = kind;
    el.dataset.zoom = String(gmap.getZoom() ?? HOME_ZOOM);
  };

  const waitIdle = () => {
    const gen = ++idleGen;
    google.maps.event.addListenerOnce(gmap, "idle", () => {
      if (!alive || gen !== idleGen) return;
      el.dataset.ready = "1";
      keepHost();
      paintPlaces();
      paintRoute();
      paintTraffic();
      paintMe();
      if (pendingFit) fitRoute();
      if (navOn) applyNavCamera();
      resize();
    });
    window.setTimeout(() => {
      if (!alive || gen !== idleGen || el.dataset.ready === "1") return;
      el.dataset.ready = "1";
      keepHost();
    }, 8000);
  };

  const rebuild = (next: MapKind) => {
    const view = camera();
    clearOverlays();
    meMark = null;
    arrow = null;
    listeners.splice(0).forEach((l) => l.remove());
    kind = next;
    el.dataset.ready = "0";
    gmap = new google.maps.Map(el, mapOptions(next, view));
    keepHost();
    attachHitView();
    bind();
    waitIdle();
    paintPlaces();
    paintRoute();
    paintTraffic();
    paintMe();
    if (navOn) applyNavCamera();
    resize();
  };

  const resize = () => {
    if (!alive) return;
    keepHost();
    google.maps.event.trigger(gmap, "resize");
  };

  gmap = new google.maps.Map(el, mapOptions("vector-light", { center: HOME, zoom: HOME_ZOOM, heading: 0, tilt: 0 }));
  keepHost();
  el.dataset.engine = "google";
  attachHitView();
  bind();

  const ready = new Promise<void>((resolve) => {
    google.maps.event.addListenerOnce(gmap, "idle", () => resolve());
    window.setTimeout(() => resolve(), 8000);
  });
  await ready;
  if (!alive || (el.dataset.engine !== "google" && el.dataset.engine !== "pending")) {
    throw new Error("aborted");
  }

  el.dataset.ready = "1";
  el.dataset.pitch = "0";
  window.setTimeout(resize, 50);
  window.setTimeout(resize, 200);
  window.setTimeout(resize, 500);
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  if (el.parentElement) ro.observe(el.parentElement);
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  window.visualViewport?.addEventListener("resize", resize);

  const api: WbMap = {
    map: {
      getBearing: () => gmap.getHeading() || 0,
      getZoom: () => gmap.getZoom() ?? HOME_ZOOM,
    },
    el,
    setPlaces(places, darkPins) {
      lastPlaces = places;
      lastDarkPins = darkPins;
      paintPlaces();
    },
    setRoutes(routes, selectedId, dark, extra) {
      lastRoutes = routes;
      selectedRouteId = selectedId;
      lastRouteDark = dark;
      paintRoute();
      if (extra?.fit && routes.some((route) => route.points.length >= 2) && !navOn) {
        pendingFit = true;
        fitRoute();
      }
    },
    clearRoute() {
      lastRoutes = [];
      selectedRouteId = null;
      pendingFit = false;
      routePolylines.forEach((line) => line.setMap(null));
      routePolylines = [];
    },
    setTraffic(on) {
      trafficOn = on;
      el.dataset.traffic = on ? "on" : "off";
      paintTraffic();
    },
    setNav(on) {
      navOn = on;
      if (!on && arrow) arrow.map = null;
      paintPlaces();
      paintMe();
      requestAnimationFrame(() => {
        resize();
        applyNavCamera();
      });
    },
    setPick(on) {
      pickOn = on;
      el.dataset.pick = on ? "1" : "0";
      paintPlaces();
    },
    setMe(pt) {
      lastMe = pt;
      paintMe();
    },
    follow(lon, lat, bearing, look) {
      const next: google.maps.CameraOptions = {
        center: look ? { lat: look.lat, lng: look.lon } : { lat, lng: lon },
        tilt: NAV_TILT,
        zoom: Math.max(gmap.getZoom() ?? NAV_ZOOM, NAV_ZOOM),
      };
      if (bearing != null && Number.isFinite(bearing)) next.heading = bearing;
      gmap.moveCamera(next);
      const mark = makeArrow();
      mark.position = { lat, lng: lon };
      mark.map = gmap;
      el.dataset.pitch = String(NAV_TILT);
    },
    setKind(next, overlays) {
      if (overlays?.places) lastPlaces = overlays.places;
      if (overlays?.darkPins != null) {
        lastDarkPins = overlays.darkPins;
        lastRouteDark = overlays.darkPins;
      }
      if (overlays?.routes) lastRoutes = overlays.routes;
      if (overlays && "selectedRouteId" in overlays) selectedRouteId = overlays.selectedRouteId ?? null;
      if (overlays?.traffic != null) trafficOn = overlays.traffic;
      const mapIdChanged = mapIdFor(next) !== mapIdFor(kind);
      const darkChanged = (next === "vector-dark") !== (kind === "vector-dark");
      if (mapIdChanged || darkChanged) {
        rebuild(next);
        return;
      }
      kind = next;
      gmap.setOptions({
        mapTypeId: next === "satellite" ? "hybrid" : "roadmap",
      });
      paintPlaces();
      paintRoute();
      paintTraffic();
      if (pendingFit) fitRoute();
      if (navOn) applyNavCamera();
      el.dataset.ready = "1";
      keepHost();
      resize();
    },
    flyTo(lat, lon, zoom = 11) {
      gmap.panTo({ lat, lng: lon });
      gmap.setZoom(zoom);
      if (navOn) gmap.setTilt(NAV_TILT);
    },
    zoomBy(dir) {
      gmap.setZoom((gmap.getZoom() ?? HOME_ZOOM) + dir);
      if (navOn) gmap.setTilt(NAV_TILT);
    },
    tapAt(x, y) {
      if (navOn) return;
      const pt = pixelToLatLng(x, y);
      if (!pt) return;
      if (pickOn) {
        emitMap(pt.lat, pt.lng);
        return;
      }
      const hit = placeNearPixel(x, y);
      if (hit) openPlace(String(hit.id));
    },
    panBy(dx, dy) {
      gmap.panBy(dx, dy);
    },
    resize,
    remove() {
      alive = false;
      listeners.splice(0).forEach((l) => l.remove());
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      ro.disconnect();
      hitView?.setMap(null);
      hitView = null;
      clearOverlays();
    },
  };

  return api;
}

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { asset } from "./assets";
import type { Place } from "../types";
import { HOME, HOME_ZOOM, NAV_TILT, NAV_ZOOM, type MapKind, type WbMap } from "./wbmap-types";

const LIGHT_MAP_ID = "a7dbf0e5d7ceea8629f41e1e";
const DARK_MAP_ID = "a7dbf0e5d7ceea8614b0b9ae";

const ARROW = `<span class="wb-gl-me wb-garrow"><svg viewBox="0 0 24 32" width="28" height="36"><path d="M12 2 L22 30 L12 23 L2 30 Z" fill="#3DADF3" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></span>`;

let boot: Promise<void> | null = null;

function mapsKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
}

function loadGoogle() {
  const key = mapsKey();
  if (!key) return Promise.reject(new Error("no-gmaps-key"));
  if (!boot) {
    setOptions({ key, v: "weekly", mapIds: [LIGHT_MAP_ID, DARK_MAP_ID] });
    boot = Promise.all([importLibrary("maps"), importLibrary("marker")]).then(() => undefined);
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

export async function createGoogleMap(
  el: HTMLElement,
  opts: {
    onPlace?: (id: string) => void;
    onMap?: (lat: number, lon: number) => void;
  },
): Promise<WbMap> {
  await loadGoogle();
  if (el.dataset.engine && el.dataset.engine !== "pending") throw new Error("aborted");

  let alive = true;
  let navOn = false;
  let lastPlaces: Place[] = [];
  let lastDarkPins = false;
  let lastRoute: [number, number][] = [];
  let lastRouteDark = false;
  let pendingFit = false;
  let pickOn = false;
  let kind: MapKind = "vector-light";
  let idleGen = 0;
  let gmap: google.maps.Map;
  let clusterer: MarkerClusterer | null = null;
  let pinMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
  let routeLine: google.maps.Polyline | null = null;
  let routeBorder: google.maps.Polyline | null = null;
  let arrow: google.maps.marker.AdvancedMarkerElement | null = null;
  const listeners: google.maps.MapsEventListener[] = [];
  let lastPickAt = 0;
  let press: { x: number; y: number } | null = null;

  const camera = () => ({
    center: gmap.getCenter()?.toJSON() || HOME,
    zoom: gmap.getZoom() ?? HOME_ZOOM,
    heading: gmap.getHeading() || 0,
    tilt: navOn ? NAV_TILT : gmap.getTilt() || 0,
  });

  const mapOptions = (next: MapKind, view = camera()): google.maps.MapOptions => ({
    center: view.center,
    zoom: view.zoom,
    heading: view.heading,
    tilt: navOn ? NAV_TILT : 0,
    disableDefaultUI: true,
    keyboardShortcuts: false,
    clickableIcons: false,
    gestureHandling: "greedy",
    headingInteractionEnabled: navOn,
    tiltInteractionEnabled: false,
    mapId: mapIdFor(next),
    mapTypeId: next === "satellite" ? "hybrid" : "roadmap",
    renderingType: google.maps.RenderingType.VECTOR,
    isFractionalZoomEnabled: true,
    colorScheme: next === "vector-dark" ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT,
  });

  const clearOverlays = () => {
    clusterer?.clearMarkers();
    clusterer = null;
    pinMarkers = [];
    routeLine?.setMap(null);
    routeBorder?.setMap(null);
    routeLine = null;
    routeBorder = null;
    if (arrow) arrow.map = null;
  };

  const paintRoute = () => {
    routeLine?.setMap(null);
    routeBorder?.setMap(null);
    routeLine = null;
    routeBorder = null;
    if (lastRoute.length < 2) return;
    const path = lastRoute.map(([lat, lon]) => ({ lat, lng: lon }));
    routeBorder = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: lastRouteDark ? "#FFCC00" : "#000099",
      strokeOpacity: 1,
      strokeWeight: 9,
      map: gmap,
      clickable: false,
      zIndex: 1,
    });
    routeLine = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: lastRouteDark ? "#FFFF00" : "#0033FF",
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: gmap,
      clickable: false,
      zIndex: 2,
    });
  };

  const fitRoute = () => {
    if (lastRoute.length < 2 || navOn) return;
    const bounds = new google.maps.LatLngBounds();
    lastRoute.forEach(([lat, lon]) => bounds.extend({ lat, lng: lon }));
    gmap.fitBounds(bounds, { top: 130, bottom: 240, left: 28, right: 56 });
    pendingFit = false;
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
        img.alt = p.name;
        img.className = "wb-gpin";
        const marker = new Advanced({
          position: { lat: p.lat, lng: p.lon },
          content: img,
          title: p.name,
          gmpClickable: true,
        });
        marker.addEventListener("gmp-click", () => opts.onPlace?.(String(p.id)));
        return marker;
      });
    clusterer = new MarkerClusterer({
      map: gmap,
      markers: pinMarkers,
      algorithm: new SuperClusterAlgorithm({ maxZoom: 11, radius: 100 }),
      renderer: {
        render({ count, position }) {
          const big = count >= 20;
          const node = document.createElement("div");
          node.className = `wb-gcluster${big ? " big" : ""}`;
          node.textContent = String(count);
          return new Advanced({
            position,
            content: node,
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

  const applyNavCamera = () => {
    gmap.setOptions({ headingInteractionEnabled: navOn, tiltInteractionEnabled: false });
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

  const bind = () => {
    listeners.splice(0).forEach((l) => l.remove());
    listeners.push(
      gmap.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        emitMap(e.latLng.lat(), e.latLng.lng());
      }),
      gmap.addListener("zoom_changed", () => {
        el.dataset.zoom = String(gmap.getZoom() ?? HOME_ZOOM);
      }),
    );
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
    listeners.splice(0).forEach((l) => l.remove());
    kind = next;
    el.dataset.ready = "0";
    gmap = new google.maps.Map(el, mapOptions(next, view));
    keepHost();
    bind();
    waitIdle();
    paintPlaces();
    paintRoute();
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
  bind();
  const onPress = (x: number, y: number) => {
    if (!pickOn || navOn) return;
    press = { x, y };
  };
  const onRelease = (x: number, y: number) => {
    if (!pickOn || navOn || !press) return;
    const dx = x - press.x;
    const dy = y - press.y;
    press = null;
    if (dx * dx + dy * dy > 36) return;
    const rect = el.getBoundingClientRect();
    const pt = latLngAt(x - rect.left, y - rect.top);
    if (pt) emitMap(pt.lat, pt.lng);
  };
  el.addEventListener(
    "pointerdown",
    (e) => {
      onPress(e.clientX, e.clientY);
    },
    true,
  );
  el.addEventListener(
    "pointerup",
    (e) => {
      onRelease(e.clientX, e.clientY);
    },
    true,
  );
  el.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      if (t) onPress(t.clientX, t.clientY);
    },
    { capture: true, passive: true },
  );
  el.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      if (t) onRelease(t.clientX, t.clientY);
    },
    { capture: true, passive: true },
  );

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
    setRoute(pts, dark, extra) {
      lastRoute = pts;
      lastRouteDark = dark;
      paintRoute();
      if (extra?.fit && pts.length >= 2 && !navOn) {
        pendingFit = true;
        fitRoute();
      }
    },
    clearRoute() {
      lastRoute = [];
      pendingFit = false;
      routeLine?.setMap(null);
      routeBorder?.setMap(null);
      routeLine = null;
      routeBorder = null;
    },
    setNav(on) {
      navOn = on;
      if (!on && arrow) arrow.map = null;
      paintPlaces();
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
    follow(lon, lat, bearing) {
      const next: google.maps.CameraOptions = {
        center: { lat, lng: lon },
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
      if (overlays?.route) lastRoute = overlays.route;
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
    resize,
    remove() {
      alive = false;
      listeners.splice(0).forEach((l) => l.remove());
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      ro.disconnect();
      clearOverlays();
    },
  };

  return api;
}

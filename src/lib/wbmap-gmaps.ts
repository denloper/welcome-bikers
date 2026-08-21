import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { asset } from "./assets";
import type { Place } from "../types";
import { haversineKm } from "./geo";
import {
  easeInOutCubic,
  interpolateAngle,
  interpolatePoint,
  NAV_ENTER_MS,
  NAV_FLAT_ENTRY_MS,
  NAV_FOLLOW_RESUME_MS,
  NAV_HEADING_MS,
  NAV_MOVE_MS,
  type NavPoint,
} from "./nav-camera";
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
function nativeApp(): boolean {
  return Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
}

function webglHealthy(): boolean {
  if (webglState != null) return webglState;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const opts = nativeApp()
      ? { powerPreference: "high-performance" as const }
      : { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext("webgl2", opts) ||
      canvas.getContext("webgl", opts)) as WebGLRenderingContext | null;
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
    // Always English labels / directions, independent of device UI language.
    setOptions({ key, v: "weekly", language: "en", region: "US", mapIds: [LIGHT_MAP_ID, DARK_MAP_ID] });
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
  let followPaused = false;
  let followResumeTimer = 0;
  let followFrame = 0;
  let gestureTimer = 0;
  let systemCameraUntil = 0;
  let shownPoint: NavPoint | null = null;
  let lastFollow: (NavPoint & { bearing: number | null }) | null = null;
  let firstFollow = true;
  let navPhase: "off" | "entering" | "active" = "off";
  let navPhaseTimer = 0;

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

  const clearFollowResume = () => {
    if (followResumeTimer) {
      window.clearTimeout(followResumeTimer);
      followResumeTimer = 0;
    }
  };

  const cameraIsSystemDriven = () => Date.now() < systemCameraUntil;

  const animateFollow = (
    target: NavPoint & { bearing: number | null },
    requestedDuration: number,
    moveCamera = true,
  ) => {
    lastFollow = target;
    window.cancelAnimationFrame(followFrame);
    const marker = makeArrow();
    const markerStart = shownPoint || target;
    const mapCenter = gmap.getCenter()?.toJSON();
    const cameraStart = {
      lat: mapCenter?.lat ?? markerStart.lat,
      lon: mapCenter?.lng ?? markerStart.lon,
    };
    const entering = navPhase === "entering";
    const startHeading = gmap.getHeading() ?? target.bearing ?? 0;
    const targetHeading = entering ? 0 : target.bearing ?? startHeading;
    const startTilt = gmap.getTilt() || 0;
    const targetTilt = entering ? 0 : NAV_TILT;
    const startZoom = gmap.getZoom() ?? NAV_ZOOM;
    const targetZoom = entering || startZoom < NAV_ZOOM ? NAV_ZOOM : startZoom;
    const markerJump = shownPoint ? haversineKm(shownPoint, target) * 1000 > 100 : false;
    const markerDuration = markerJump ? 0 : requestedDuration;
    const cameraDuration = requestedDuration;
    const started = performance.now();

    const drawFrame = (now: number) => {
      const cameraProgress = cameraDuration <= 0 ? 1 : Math.min(1, (now - started) / cameraDuration);
      const markerProgress = markerDuration <= 0 ? 1 : Math.min(1, (now - started) / markerDuration);
      const cameraEase = easeInOutCubic(cameraProgress);
      const markerEase = easeInOutCubic(markerProgress);
      const markerPoint = interpolatePoint(markerStart, target, markerEase);
      shownPoint = markerPoint;
      marker.position = { lat: markerPoint.lat, lng: markerPoint.lon };
      marker.map = gmap;

      if (moveCamera && navOn && !followPaused) {
        const center = interpolatePoint(cameraStart, target, cameraEase);
        systemCameraUntil = Date.now() + 180;
        gmap.moveCamera({
          center: { lat: center.lat, lng: center.lon },
          heading: interpolateAngle(startHeading, targetHeading, cameraEase),
          tilt: startTilt + (targetTilt - startTilt) * cameraEase,
          zoom: startZoom + (targetZoom - startZoom) * cameraEase,
        });
      }

      if (cameraProgress < 1 || markerProgress < 1) {
        followFrame = window.requestAnimationFrame(drawFrame);
      }
    };
    followFrame = window.requestAnimationFrame(drawFrame);
  };

  const clearNavPhaseTimer = () => {
    if (navPhaseTimer) {
      window.clearTimeout(navPhaseTimer);
      navPhaseTimer = 0;
    }
  };

  const activateNavigationPhase = () => {
    navPhaseTimer = 0;
    if (!navOn) return;
    navPhase = "active";
    el.dataset.cameraPhase = "active";
    el.dataset.pitch = String(NAV_TILT);
    if (!followPaused && lastFollow) animateFollow(lastFollow, NAV_ENTER_MS);
  };

  const resumeFollow = () => {
    clearFollowResume();
    followPaused = false;
    el.dataset.follow = navOn ? "on" : "off";
    if (navOn && lastFollow) animateFollow(lastFollow, NAV_ENTER_MS);
  };

  const pauseFollow = () => {
    if (!navOn) return;
    followPaused = true;
    el.dataset.follow = "paused";
    clearFollowResume();
    followResumeTimer = window.setTimeout(resumeFollow, NAV_FOLLOW_RESUME_MS);
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
      el.dataset.pitch = navPhase === "entering" ? "0" : String(NAV_TILT);
      if (lastFollow && !followPaused) animateFollow(lastFollow, NAV_ENTER_MS);
    } else {
      systemCameraUntil = Date.now() + 180;
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
        if (navOn && !cameraIsSystemDriven()) {
          window.clearTimeout(gestureTimer);
          gestureTimer = window.setTimeout(() => {
            if (!cameraIsSystemDriven()) pauseFollow();
          }, 120);
        }
      }),
      gmap.addListener("dragstart", pauseFollow),
      gmap.addListener("heading_changed", () => {
        if (navOn && !cameraIsSystemDriven()) pauseFollow();
      }),
      gmap.addListener("tilt_changed", () => {
        if (navOn && !cameraIsSystemDriven()) pauseFollow();
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
      followPaused = false;
      clearFollowResume();
      el.dataset.follow = on ? "on" : "off";
      clearNavPhaseTimer();
      if (on) {
        navPhase = "entering";
        el.dataset.cameraPhase = "entering";
        el.dataset.navEntry = "flat-to-3d";
        el.dataset.pitch = "0";
        el.dataset.zoom = String(NAV_ZOOM);
        navPhaseTimer = window.setTimeout(activateNavigationPhase, NAV_FLAT_ENTRY_MS);
      } else {
        navPhase = "off";
        el.dataset.cameraPhase = "off";
        firstFollow = true;
        lastFollow = null;
        shownPoint = null;
        window.cancelAnimationFrame(followFrame);
        if (arrow) arrow.map = null;
      }
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
    follow(lon, lat, bearing) {
      const target = {
        lat,
        lon,
        bearing: bearing != null && Number.isFinite(bearing) ? bearing : null,
      };
      animateFollow(
        target,
        firstFollow && navPhase === "entering" ? NAV_FLAT_ENTRY_MS : firstFollow ? NAV_ENTER_MS : NAV_MOVE_MS,
        !followPaused,
      );
      firstFollow = false;
      el.dataset.pitch = navPhase === "entering" ? "0" : String(NAV_TILT);
    },
    orient(bearing) {
      if (!navOn || !lastFollow || !Number.isFinite(bearing)) return;
      lastFollow = { ...lastFollow, bearing };
      if (followPaused || navPhase === "entering") return;
      animateFollow(lastFollow, NAV_HEADING_MS);
    },
    resumeFollow,
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
      if (navOn) pauseFollow();
      systemCameraUntil = Date.now() + 180;
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
      window.cancelAnimationFrame(followFrame);
      window.clearTimeout(gestureTimer);
      clearFollowResume();
      clearNavPhaseTimer();
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

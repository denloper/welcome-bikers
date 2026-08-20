import { HOME_ZOOM, type WbMap } from "./wbmap-types";

export {
  HOME,
  HOME_ZOOM,
  NAV_TILT,
  NAV_ZOOM,
  type MapKind,
  type WbCamera,
  type WbMap,
} from "./wbmap-types";

export function createWbMap(
  el: HTMLElement,
  opts: {
    onPlace?: (id: string) => void;
    onMap?: (lat: number, lon: number) => void;
  },
): WbMap {
  let impl: WbMap | null = null;
  const wait: Array<(m: WbMap) => void> = [];
  const use = (fn: (m: WbMap) => void) => {
    if (impl) fn(impl);
    else wait.push(fn);
  };

  el.dataset.engine = "pending";
  el.dataset.pitch = "0";
  el.dataset.boot = String(Date.now()) + Math.random().toString(16).slice(2);

  const api: WbMap = {
    map: {
      getBearing: () => impl?.map.getBearing() ?? 0,
      getZoom: () => impl?.map.getZoom() ?? HOME_ZOOM,
    },
    el,
    setPlaces(places, darkPins) {
      use((m) => m.setPlaces(places, darkPins));
    },
    setRoutes(routes, selectedId, dark, extra) {
      use((m) => m.setRoutes(routes, selectedId, dark, extra));
    },
    clearRoute() {
      use((m) => m.clearRoute());
    },
    setTraffic(on) {
      use((m) => m.setTraffic(on));
    },
    setNav(on) {
      use((m) => m.setNav(on));
    },
    setPick(on) {
      use((m) => m.setPick(on));
    },
    setMe(pt) {
      use((m) => m.setMe(pt));
    },
    follow(lon, lat, bearing) {
      use((m) => m.follow(lon, lat, bearing));
    },
    orient(bearing) {
      use((m) => m.orient(bearing));
    },
    resumeFollow() {
      use((m) => m.resumeFollow());
    },
    setKind(kind, overlays) {
      use((m) => m.setKind(kind, overlays));
    },
    flyTo(lat, lon, zoom) {
      use((m) => m.flyTo(lat, lon, zoom));
    },
    zoomBy(dir) {
      use((m) => m.zoomBy(dir));
    },
    tapAt(x, y) {
      use((m) => m.tapAt(x, y));
    },
    panBy(dx, dy) {
      use((m) => m.panBy(dx, dy));
    },
    resize() {
      use((m) => m.resize());
    },
    remove() {
      wait.length = 0;
      el.dataset.engine = "dead";
      impl?.remove();
      impl = null;
    },
  };

  void (async () => {
    try {
      const { createGoogleMap } = await import("./wbmap-gmaps");
      const googleMap = createGoogleMap(el, opts);
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("gmaps-timeout")), 12_000);
      });
      impl = await Promise.race([googleMap, timeout]);
    } catch {
      if (el.dataset.engine === "dead" || !el.isConnected) return;
      try {
        el.dataset.engine = "libre";
        el.replaceChildren();
        const { createLibreMap } = await import("./wbmap-libre");
        if (el.dataset.engine === "dead" || !el.isConnected) return;
        impl = createLibreMap(el, opts);
      } catch {
        if (el.dataset.engine === "dead" || !el.isConnected) return;
        el.dataset.engine = "failed";
        el.dataset.ready = "1";
        const note = document.createElement("div");
        note.className = "map-engine-failed";
        note.textContent =
          "The map could not start in this browser. Check the internet connection and reload the page (Ctrl+F5).";
        el.replaceChildren(note);
        return;
      }
    }
    if (el.dataset.engine === "dead") {
      impl?.remove();
      impl = null;
      return;
    }
    wait.splice(0).forEach((fn) => fn(impl!));
  })();

  return api;
}

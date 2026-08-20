import { HOME_ZOOM, type WbMap } from "./wbmap-types";
import { createGoogleMap } from "./wbmap-gmaps";
import { createLibreMap } from "./wbmap-libre";

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

  const api: WbMap = {
    map: {
      getBearing: () => impl?.map.getBearing() ?? 0,
      getZoom: () => impl?.map.getZoom() ?? HOME_ZOOM,
    },
    el,
    setPlaces(places, darkPins) {
      use((m) => m.setPlaces(places, darkPins));
    },
    setRoute(pts, dark, extra) {
      use((m) => m.setRoute(pts, dark, extra));
    },
    clearRoute() {
      use((m) => m.clearRoute());
    },
    setNav(on) {
      use((m) => m.setNav(on));
    },
    setPick(on) {
      use((m) => m.setPick(on));
    },
    follow(lon, lat, bearing) {
      use((m) => m.follow(lon, lat, bearing));
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
      const googleMap = createGoogleMap(el, opts);
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("gmaps-timeout")), 12_000);
      });
      impl = await Promise.race([googleMap, timeout]);
    } catch {
      if (el.dataset.engine === "dead" || !el.isConnected) return;
      el.dataset.engine = "libre";
      el.replaceChildren();
      impl = createLibreMap(el, opts);
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

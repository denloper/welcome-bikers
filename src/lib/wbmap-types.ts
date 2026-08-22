import type { Place } from "../types";

export const NAV_TILT = 50;
export const NAV_ZOOM = 18;
export const HOME = { lat: 48.2, lng: 16.4 };
export const HOME_ZOOM = 5;

/**
 * Exact copy of the original app's user-location pin
 * (welcomebikers.eu /uploads/files/6642borhq1s6du1555mn897c_component_5.svg),
 * shown at 30x40 with the tip anchored at bottom center.
 */
export const USER_PIN_HTML = `<span class="wb-me-star"><svg viewBox="0 0 165 209" width="30" height="40" aria-hidden="true"><path d="M161 82.6301C161 115.26 116.66 172.81 94.5398 199.48C88.1898 207.14 76.3998 207.14 70.0498 199.48C47.9298 172.8 3.58984 115.25 3.58984 82.6301C3.58984 39.1601 38.8298 3.93018 82.2898 3.93018C125.75 3.93018 160.99 39.1701 160.99 82.6301H161Z" fill="#29AAE1"/><path d="M82.2996 208.73C76.4996 208.73 71.0596 206.17 67.3596 201.72C42.2396 171.42 0.0996094 115.66 0.0996094 82.6301C0.0996094 37.3001 36.9796 0.430176 82.2996 0.430176C127.62 0.430176 164.5 37.3101 164.5 82.6301C164.5 96.8001 155.76 131.12 97.2395 201.72C93.5495 206.18 88.0996 208.73 82.2996 208.73ZM82.2996 7.43018C40.8296 7.43018 7.09961 41.1701 7.09961 82.6301C7.09961 114.61 53.0095 173.44 72.7495 197.25C75.1095 200.1 78.5896 201.73 82.2996 201.73C86.0096 201.73 89.4896 200.1 91.8496 197.25C111.59 173.44 157.5 114.61 157.5 82.6301C157.5 41.1601 123.76 7.43018 82.2996 7.43018Z" fill="white"/><path d="M90.3593 55.2501L93.0993 63.6802C94.1293 66.8502 97.0792 69.0001 100.419 69.0001H109.289C116.739 69.0001 119.839 78.5402 113.809 82.9202L106.639 88.1301C103.939 90.0901 102.819 93.5601 103.849 96.7301L106.589 105.16C108.889 112.25 100.779 118.14 94.7492 113.76L87.5793 108.55C84.8793 106.59 81.2293 106.59 78.5393 108.55L71.3694 113.76C65.3394 118.14 57.2293 112.25 59.5293 105.16L62.2693 96.7301C63.2993 93.5601 62.1692 90.0901 59.4792 88.1301L52.3093 82.9202C46.2793 78.5402 49.3793 69.0001 56.8293 69.0001H65.6992C69.0292 69.0001 71.9893 66.8502 73.0193 63.6802L75.7592 55.2501C78.0592 48.1601 88.0891 48.1601 90.3891 55.2501H90.3593Z" fill="white"/></svg></span>`;

/** Shared GO puck for Google and MapLibre: wide blue navigation arrow + WB star. */
export const NAV_PUCK_HTML = `<span class="wb-gl-me wb-garrow wb-nav-puck" data-quality="good" data-design="wide-blue-star"><span class="wb-nav-accuracy"></span><svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true"><defs><linearGradient id="wb-nav-gradient" x1="11" y1="7" x2="55" y2="59" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#39d8f3"/><stop offset=".48" stop-color="#0baaf4"/><stop offset="1" stop-color="#0875ee"/></linearGradient><radialGradient id="wb-nav-sheen" cx="0" cy="0" r="1" gradientTransform="translate(21 18) rotate(46) scale(45)" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity=".28"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><path class="wb-puck-core" fill="url(#wb-nav-gradient)" d="M32 2c3.8 0 7 2.2 8.8 5.8l20.4 42.6c3.4 7.1-4.5 13.9-11 9.7l-13.7-8.9a8.4 8.4 0 0 0-9 0l-13.7 8.9c-6.5 4.2-14.4-2.6-11-9.7L23.2 7.8C25 4.2 28.2 2 32 2Z"/><path class="wb-puck-sheen" fill="url(#wb-nav-sheen)" d="M32 2c3.8 0 7 2.2 8.8 5.8l20.4 42.6c3.4 7.1-4.5 13.9-11 9.7l-13.7-8.9a8.4 8.4 0 0 0-9 0l-13.7 8.9c-6.5 4.2-14.4-2.6-11-9.7L23.2 7.8C25 4.2 28.2 2 32 2Z"/><path class="wb-puck-star" d="m32 20.6 3.25 6.58 7.27 1.06-5.26 5.12 1.24 7.24L32 37.18l-6.5 3.42 1.24-7.24-5.26-5.12 7.27-1.06Z"/></svg></span>`;

export type MapKind = "vector-light" | "vector-dark" | "satellite";

export type WbCamera = {
  getBearing: () => number;
  getZoom: () => number;
};

export type WbRouteLine = {
  id: string;
  points: [number, number][];
};

export type WbRouteStop = {
  lat: number;
  lon: number;
  label: string;
  role: "start" | "via" | "end";
};

export function routeStopMarkerNode(stop: WbRouteStop, index: number): HTMLElement {
  const marker = document.createElement("span");
  const roleLabel = stop.role === "start" ? "Start" : stop.role === "end" ? "Finish" : "Stop";
  marker.className = `wb-route-map-stop is-${stop.role}`;
  marker.dataset.stopRole = stop.role;
  marker.dataset.stopOrder = String(index + 1);
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", `${roleLabel} ${index + 1}: ${stop.label}`);
  marker.title = stop.label;

  const badge = document.createElement("span");
  badge.className = "wb-route-map-stop-badge";
  badge.textContent = String(index + 1);
  marker.appendChild(badge);
  return marker;
}

export type WbRouteProgress = {
  routeId: string;
  index: number;
  point: [number, number];
  fraction: number;
};

export type WbFollowOptions = {
  camera?: { lat: number; lon: number } | null;
  speed?: number | null;
  accuracy?: number | null;
};

export type WbMapOptions = {
  onPlace?: (id: string) => void;
  onMap?: (lat: number, lon: number) => void;
  onFollowChange?: (following: boolean) => void;
};

export type WbMap = {
  map: WbCamera;
  el: HTMLElement;
  setPlaces: (places: Place[], darkPins: boolean) => void;
  setRouteStops: (stops: WbRouteStop[]) => void;
  setRoutes: (routes: WbRouteLine[], selectedId: string | null, dark: boolean, opts?: { fit?: boolean }) => void;
  setRouteProgress: (progress: WbRouteProgress | null) => void;
  clearRoute: () => void;
  setTraffic: (on: boolean) => void;
  setNav: (on: boolean) => void;
  setPick: (on: boolean) => void;
  setMe: (pt: { lat: number; lon: number } | null) => void;
  follow: (lon: number, lat: number, bearing?: number | null, opts?: WbFollowOptions) => void;
  orient: (bearing: number) => void;
  resumeFollow: () => void;
  setKind: (
    kind: MapKind,
    overlays?: {
      places?: Place[];
      darkPins?: boolean;
      routes?: WbRouteLine[];
      selectedRouteId?: string | null;
      traffic?: boolean;
    },
  ) => void;
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  zoomBy: (dir: 1 | -1) => void;
  tapAt: (x: number, y: number) => void;
  panBy: (dx: number, dy: number) => void;
  resize: () => void;
  remove: () => void;
};

import type { Place } from "../types";

export const NAV_TILT = 45;
export const NAV_ZOOM = 17;
export const HOME = { lat: 42.6930838, lng: 18.7338288 };
export const HOME_ZOOM = 15;

export type MapKind = "vector-light" | "vector-dark" | "satellite";

export type WbCamera = {
  getBearing: () => number;
  getZoom: () => number;
};

export type WbMap = {
  map: WbCamera;
  el: HTMLElement;
  setPlaces: (places: Place[], darkPins: boolean) => void;
  setRoute: (pts: [number, number][], dark: boolean, opts?: { fit?: boolean }) => void;
  clearRoute: () => void;
  setNav: (on: boolean) => void;
  follow: (lon: number, lat: number, bearing?: number | null) => void;
  setKind: (kind: MapKind, overlays?: { places?: Place[]; darkPins?: boolean; route?: [number, number][] }) => void;
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  zoomBy: (dir: 1 | -1) => void;
  resize: () => void;
  remove: () => void;
};

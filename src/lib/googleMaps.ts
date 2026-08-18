import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

export const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

let ready: Promise<void> | null = null;
let authWait: Promise<void> | null = null;
let rejected = false;

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

export function loadGoogleMaps(): Promise<void> {
  if (!mapsKey || rejected) {
    return Promise.reject(new Error("Google Maps unavailable"));
  }
  if (!ready) {
    setOptions({
      key: mapsKey,
      v: "weekly",
      libraries: ["places", "marker"],
    });
    ready = Promise.all([importLibrary("maps"), importLibrary("marker"), importLibrary("places")]).then(
      () => undefined,
    );
  }
  return ready;
}

export function waitGoogleAuth(ms = 900): Promise<void> {
  if (rejected) return Promise.reject(new Error("Google Maps key rejected"));
  if (!authWait) {
    authWait = new Promise((resolve, reject) => {
      window.gm_authFailure = () => {
        rejected = true;
        reject(new Error("Google Maps key rejected"));
      };
      window.setTimeout(() => {
        if (rejected) return;
        resolve();
      }, ms);
    });
  }
  return authWait;
}

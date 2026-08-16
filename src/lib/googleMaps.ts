import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

export const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

let ready: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (!mapsKey) {
    return Promise.reject(new Error("Missing VITE_GOOGLE_MAPS_API_KEY"));
  }
  if (!ready) {
    setOptions({
      key: mapsKey,
      v: "weekly",
      libraries: ["places", "marker"],
    });
    ready = Promise.all([
      importLibrary("maps"),
      importLibrary("marker"),
      importLibrary("places"),
    ]).then(() => undefined);
  }
  return ready;
}

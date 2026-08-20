import { Capacitor } from "@capacitor/core";
import { Geolocation, type Position } from "@capacitor/geolocation";

export type GeoFix = {
  lat: number;
  lon: number;
  heading: number | null;
  speed: number | null;
  accuracy: number;
  timestamp: number;
};

export type LocationWatch = { clear: () => void };

type BrowserPosition = GeolocationPosition;

function fromBrowser(position: BrowserPosition): GeoFix {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    heading: position.coords.heading,
    speed: position.coords.speed,
    accuracy: position.coords.accuracy || 50,
    timestamp: position.timestamp,
  };
}

function fromNative(position: Position): GeoFix {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    heading: position.coords.heading ?? null,
    speed: position.coords.speed ?? null,
    accuracy: position.coords.accuracy ?? 50,
    timestamp: position.timestamp,
  };
}

export async function ensureLocationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return Boolean(navigator.geolocation);
  const current = await Geolocation.checkPermissions();
  if (current.location === "granted" || current.coarseLocation === "granted") return true;
  const next = await Geolocation.requestPermissions();
  return next.location === "granted" || next.coarseLocation === "granted";
}

export async function readLocation(opts?: { timeout?: number; maximumAge?: number }): Promise<GeoFix | null> {
  const timeout = opts?.timeout ?? 8_000;
  const maximumAge = opts?.maximumAge ?? 15_000;
  if (!Capacitor.isNativePlatform()) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(fromBrowser(position)),
        () => resolve(null),
        { enableHighAccuracy: true, timeout, maximumAge },
      );
    });
  }
  try {
    if (!(await ensureLocationPermission())) return null;
    return fromNative(
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout,
        maximumAge,
      }),
    );
  } catch {
    return null;
  }
}

export function watchLocation(
  onFix: (fix: GeoFix) => void,
  opts?: { timeout?: number; maximumAge?: number },
): LocationWatch {
  const timeout = opts?.timeout ?? 12_000;
  const maximumAge = opts?.maximumAge ?? 500;
  if (!Capacitor.isNativePlatform()) {
    if (!navigator.geolocation) return { clear() {} };
    const id = navigator.geolocation.watchPosition(
      (position) => onFix(fromBrowser(position)),
      () => {},
      { enableHighAccuracy: true, timeout, maximumAge },
    );
    return { clear: () => navigator.geolocation.clearWatch(id) };
  }

  let cleared = false;
  let watchId: string | undefined;
  void (async () => {
    if (!(await ensureLocationPermission()) || cleared) return;
    watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout, maximumAge },
      (position, error) => {
        if (cleared || error || !position) return;
        onFix(fromNative(position));
      },
    );
  })();
  return {
    clear() {
      cleared = true;
      if (watchId) void Geolocation.clearWatch({ id: watchId });
    },
  };
}

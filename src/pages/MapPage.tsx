import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconBack,
  IconFilter,
  IconGlobe,
  IconGo,
  IconInfo,
  IconLocate,
  IconMenu,
  IconMoon,
  IconPlus,
  IconRouteBuild,
  IconSearch,
  IconShare,
  IconSun,
  IconTurn,
} from "../components/Icons";
import { NavHud, type NavRouteState } from "../components/NavHud";
import { Stars } from "../components/Stars";
import { PlacePhoto } from "../components/PlacePhoto";
import { loadPlaces } from "../lib/data";
import { bearingDeg, haversineKm, pointAhead, validCoords } from "../lib/geo";
import { filterGpsFix, freshGpsState } from "../lib/gps";
import { readLocation, watchLocation, type LocationWatch } from "../lib/location";
import { angleDelta, navLookAheadMeters } from "../lib/nav-camera";
import {
  freshRerouteState,
  MIN_NAV_METERS,
  navTrackingTarget,
  remainingAlong,
  tripTooShort,
  updateReroute,
} from "../lib/nav";
import { freshVoiceState, hushVoice, nextVoice, speakLine, warmVoices } from "../lib/voice";
import { createWbMap, NAV_TILT, type MapKind, type WbMap } from "../lib/wbmap";
import {
  formatArrival,
  formatDriveTime,
  formatMeters,
  maneuverPreviews,
  planRoute,
  planRoutes,
  type DriveRoute,
  type NavStep,
  type RouteProfile,
  type RoutingOptions,
} from "../lib/osrm";
import { photosFor } from "../lib/photos";
import { TYPE_CHIP } from "../lib/categories";
import type { Place, PlaceType } from "../types";

const TYPES: PlaceType[] = [
  "hotels",
  "shops",
  "bars",
  "restaurants",
  "services",
  "rent",
  "festivals",
  "viewpoints",
  "historical",
];

type Stop = { lat: number; lon: number; label: string; role: "start" | "via" | "end" };

function parsePts(raw: string | null) {
  if (!raw) return [];
  return raw
    .split("|")
    .map((s) => {
      const [lat, lon] = s.split(",").map(Number);
      return { lat, lon };
    })
    .filter((p) => validCoords(p.lat, p.lon));
}

async function getHere(): Promise<{ lat: number; lon: number } | null> {
  const fix = await readLocation({ timeout: 8_000, maximumAge: 15_000 });
  return fix ? { lat: fix.lat, lon: fix.lon } : null;
}

function applyGpsStart(stops: Stop[], geo: { lat: number; lon: number }): Stop[] {
  if (!stops.length) return stops;
  const start: Stop = { lat: geo.lat, lon: geo.lon, label: "My current location", role: "start" };
  const nearFirst = haversineKm(geo, stops[0]) < 0.35;
  const tail = nearFirst ? stops.slice(1) : stops;
  if (!tail.length) return [start, stops[stops.length - 1]];
  const last = { ...tail[tail.length - 1], role: "end" as const };
  const mid = tail.slice(0, -1).map((s) => ({ ...s, role: "via" as const }));
  return [start, ...mid, last];
}

function nearestPlace(places: Place[], lat: number, lon: number): Place | null {
  let best: Place | null = null;
  let d = 0.25;
  for (const p of places) {
    if (!validCoords(p.lat, p.lon)) continue;
    const km = haversineKm({ lat, lon }, p);
    if (km < d) {
      d = km;
      best = p;
    }
  }
  return best;
}

let wakeLock: WakeLockSentinel | null = null;
let wakeGeneration = 0;

async function setWake(on: boolean) {
  const generation = ++wakeGeneration;
  try {
    if (!on) {
      await wakeLock?.release();
      wakeLock = null;
      return;
    }
    const requested = (await navigator.wakeLock?.request("screen")) ?? null;
    if (generation !== wakeGeneration) {
      await requested?.release();
      return;
    }
    wakeLock = requested;
  } catch {
    if (generation === wakeGeneration) wakeLock = null;
  }
}

function setGoChrome(on: boolean) {
  document.body.classList.toggle("wb-nav-go", on);
  document.querySelector(".app")?.classList.toggle("no-nav", on);
  void setWake(on);
}

function requestCompassAccess() {
  if (typeof DeviceOrientationEvent === "undefined") return;
  const orientation = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (typeof orientation.requestPermission === "function") {
    void orientation.requestPermission().catch(() => "denied");
  }
}

function mapKind(light: boolean, sat: boolean): MapKind {
  if (sat) return "satellite";
  return light ? "vector-light" : "vector-dark";
}

type ThemeMode = "auto" | "light" | "dark";

function automaticLight() {
  const hour = new Date().getHours();
  if (hour >= 8 && hour < 19) return true;
  if (hour >= 20 || hour < 7) return false;
  return !window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function MapPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mapEl = useRef<HTMLDivElement>(null);
  const wbRef = useRef<WbMap | null>(null);
  const watchRef = useRef<LocationWatch | null>(null);
  const pickGen = useRef(0);
  const goStartGen = useRef(0);
  const [places, setPlaces] = useState<Place[]>([]);
  const placesRef = useRef(places);
  placesRef.current = places;
  const [q, setQ] = useState("");
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(TYPES.map((t) => [t, true])));
  const [friendly, setFriendly] = useState(false);
  const [draftOn, setDraftOn] = useState(on);
  const [draftFriendly, setDraftFriendly] = useState(false);
  const [filters, setFilters] = useState(false);
  const [info, setInfo] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("wb.map.theme");
    return stored === "auto" || stored === "dark" || stored === "light" ? stored : "light";
  });
  const [autoLight, setAutoLight] = useState(automaticLight);
  const light = themeMode === "auto" ? autoLight : themeMode === "light";
  const [sat] = useState(false);
  const [picked, setPicked] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const [tolls, setTolls] = useState(false);
  const [profile, setProfile] = useState<RouteProfile>("fastest");
  const [ferries, setFerries] = useState(true);
  const [pavedOnly, setPavedOnly] = useState(true);
  const [traffic, setTraffic] = useState(true);
  const routingOptions = useMemo<RoutingOptions>(
    () => ({
      profile,
      allowTolls: tolls,
      allowFerries: ferries,
      pavedOnly,
      alternatives: true,
    }),
    [profile, tolls, ferries, pavedOnly],
  );
  const routingRef = useRef(routingOptions);
  routingRef.current = routingOptions;
  const [drive, setDrive] = useState<DriveRoute | null>(null);
  const [routeChoices, setRouteChoices] = useState<DriveRoute[]>([]);
  const driveRef = useRef<DriveRoute | null>(null);
  driveRef.current = drive;
  const [routingErr, setRoutingErr] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const [following, setFollowing] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const navigatingRef = useRef(false);
  navigatingRef.current = navigating;
  const compassHeadingRef = useRef<number | null>(null);
  const voiceRef = useRef(freshVoiceState());
  const voiceRouteRef = useRef("");
  const [voiceMuted, setVoiceMuted] = useState(() => localStorage.getItem("wb.nav.muted") === "1");
  const [pickMode, setPickMode] = useState<null | "start" | "via" | "to">(null);
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const pickPtr = useRef<{ id: number; x: number; y: number; dragged: boolean } | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [buildTo, setBuildTo] = useState<Stop | null>(null);
  const [viaOpen, setViaOpen] = useState(false);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const hereRef = useRef(here);
  hereRef.current = here;
  const [locating, setLocating] = useState(false);
  const kindInit = useRef(true);
  const overlayRef = useRef<{
    filtered: Place[];
    darkPins: boolean;
    routes: { id: string; points: [number, number][] }[];
    selectedRouteId: string | null;
    traffic: boolean;
  }>({
    filtered: [],
    darkPins: false,
    routes: [],
    selectedRouteId: null,
    traffic: true,
  });

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return places.filter((p) => {
      if (!validCoords(p.lat, p.lon)) return false;
      if (!p.types.some((t) => on[t])) return false;
      if (friendly && !p.bikersFriendly) return false;
      if (s && !`${p.name} ${p.city} ${p.country}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [places, q, on, friendly]);

  const trip = Boolean(stops && stops.length >= 2);
  const darkPins = !light && !sat;
  const mapRoutes = (routeChoices.length ? routeChoices : drive ? [drive] : []).map((route) => ({
    id: route.id,
    points: route.geometry,
  }));
  overlayRef.current = {
    filtered,
    darkPins,
    routes: mapRoutes,
    selectedRouteId: drive?.id || null,
    traffic,
  };
  const live = navigating && drive ? remainingAlong(drive, here || { lat: stops![0].lat, lon: stops![0].lon }) : null;
  const nowStep: NavStep | undefined = drive?.steps[live?.stepI ?? 0];
  const nextStep: NavStep | undefined = drive?.steps[(live?.stepI ?? 0) + 1];
  const maneuvers = navigating && drive && live
    ? maneuverPreviews(drive, live.stepI, live.stepRemain, 3)
    : [];

  function stopNavigation() {
    goStartGen.current += 1;
    navigatingRef.current = false;
    setNavigating(false);
  }

  useEffect(() => {
    if (!navigating) {
      hushVoice();
      voiceRef.current = freshVoiceState();
      return;
    }
    const sig = drive?.id || "";
    if (sig !== voiceRouteRef.current) {
      voiceRouteRef.current = sig;
      voiceRef.current = freshVoiceState();
    }
    if (!live) return;
    const announce = nextStep && nextStep.type !== "depart" ? nextStep : nowStep;
    const { state, line } = nextVoice(voiceRef.current, {
      arrived: Boolean(live.arrived),
      stepI: live.stepI,
      stepRemain: live.stepRemain,
      next: announce,
    });
    voiceRef.current = state;
    if (line && !voiceMuted) speakLine(line);
  }, [navigating, drive?.id, live?.arrived, live?.stepI, live?.stepRemain, nextStep, nowStep, voiceMuted]);

  useEffect(() => {
    localStorage.setItem("wb.nav.muted", voiceMuted ? "1" : "0");
    if (voiceMuted) hushVoice();
  }, [voiceMuted]);

  useEffect(() => {
    loadPlaces().then(setPlaces);
    warmVoices();
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("wb.map.theme", themeMode);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const update = () => setAutoLight(automaticLight());
    const timer = window.setInterval(update, 60_000);
    media?.addEventListener?.("change", update);
    update();
    return () => {
      window.clearInterval(timer);
      media?.removeEventListener?.("change", update);
    };
  }, [themeMode]);

  useLayoutEffect(() => {
    if (!mapEl.current) return;
    const wb = createWbMap(mapEl.current, {
      onPlace(id) {
        if (navigatingRef.current) return;
        const p = placesRef.current.find((x) => String(x.id) === String(id));
        if (!p) return;
        if (pickModeRef.current === "via") {
          setStops((cur) => {
            if (!cur || cur.length < 2) return cur;
            const next = cur.slice();
            next.splice(next.length - 1, 0, { lat: p.lat, lon: p.lon, label: p.name, role: "via" });
            return next;
          });
          setPickMode(null);
          return;
        }
        if (pickModeRef.current === "to") {
          setBuildTo({ lat: p.lat, lon: p.lon, label: p.name, role: "end" });
          return;
        }
        if (pickModeRef.current === "start") {
          pickGen.current += 1;
          setLocating(false);
          setStops((cur) => {
            if (!cur) return cur;
            const next = cur.slice();
            next[0] = { lat: p.lat, lon: p.lon, label: p.name, role: "start" };
            return next;
          });
          setPickMode(null);
          return;
        }
        setPicked(p);
      },
      onMap(lat, lon) {
        if (navigatingRef.current) return;
        const mode = pickModeRef.current;
        if (!mode) return;
        const hit = nearestPlace(placesRef.current, lat, lon);
        pickGen.current += 1;
        setLocating(false);
        if (mode === "start") {
          setStops((cur) => {
            if (!cur) return cur;
            const next = cur.slice();
            next[0] = { lat, lon, label: hit?.name || "My current location", role: "start" };
            return next;
          });
          setPickMode(null);
        } else if (mode === "to") {
          setBuildTo({
            lat,
            lon,
            label: hit?.name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
            role: "end",
          });
        } else {
          setStops((cur) => {
            if (!cur || cur.length < 2) return cur;
            const next = cur.slice();
            const label = hit?.name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
            next.splice(next.length - 1, 0, { lat, lon, label, role: "via" });
            return next;
          });
          setPickMode(null);
        }
      },
      onFollowChange(next) {
        setFollowing(next);
      },
    });
    wbRef.current = wb;
    setReady(true);
    return () => {
      goStartGen.current += 1;
      navigatingRef.current = false;
      wb.remove();
      wbRef.current = null;
    };
  }, []);

  useEffect(() => {
    wbRef.current?.setPlaces(filtered, darkPins);
  }, [filtered, darkPins, ready]);

  useEffect(() => {
    wbRef.current?.setPick(Boolean(pickMode) && !navigating);
  }, [pickMode, navigating, ready]);

  useEffect(() => {
    wbRef.current?.setMe(!navigating && here ? here : null);
  }, [here, navigating, ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function init() {
      const via = parsePts(params.get("via"));
      const to = parsePts(params.get("to"));
      const named = params.get("name")?.trim() || "";
      if (!via.length && !to.length) {
        if (!cancelled) {
          setStops(null);
          setDrive(null);
          setRouteChoices([]);
          stopNavigation();
        }
        return;
      }
      setPicked(null);
      stopNavigation();
      const geo = await getHere();
      if (cancelled) return;
      if (geo) setHere(geo);
      if (via.length >= 2) {
        const built: Stop[] = via.map((p, i) => {
          const hit = nearestPlace(placesRef.current, p.lat, p.lon);
          const role: Stop["role"] = i === 0 ? "start" : i === via.length - 1 ? "end" : "via";
          let label = hit?.name || `Stop ${i + 1}`;
          if (i === via.length - 1 && named) label = named;
          return { ...p, label, role };
        });
        if (geo) setStops(applyGpsStart(built, geo));
        else {
          setPickMode("start");
          setStops(built);
        }
        return;
      }
      const dest = to[0];
      const hit = nearestPlace(placesRef.current, dest.lat, dest.lon);
      const end: Stop = {
        ...dest,
        label: named || hit?.name || "Destination",
        role: "end",
      };
      if (geo) setStops(applyGpsStart([end], geo));
      else {
        setPickMode("start");
        setStops([{ ...dest, label: "My current location", role: "start" }, end]);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [params, ready]);

  useEffect(() => {
    if (!ready || !stops || stops.length < 2) {
      setDrive(null);
      setRouteChoices([]);
      setRoutingErr(false);
      wbRef.current?.clearRoute();
      return;
    }
    if (tripTooShort(stops)) {
      setDrive(null);
      setRouteChoices([]);
      setRoutingErr(false);
      wbRef.current?.clearRoute();
      wbRef.current?.flyTo(stops[stops.length - 1].lat, stops[stops.length - 1].lon, 16);
      return;
    }
    let cancelled = false;
    planRoutes(stops, routingOptions).then((routes) => {
      if (cancelled) return;
      setRouteChoices(routes);
      setDrive((current) => routes.find((route) => route.id === current?.id) || routes[0] || null);
      setRoutingErr(routes.length === 0);
    });
    return () => {
      cancelled = true;
    };
  }, [stops, routingOptions, ready]);

  useEffect(() => {
    const wb = wbRef.current;
    if (!wb || !ready) return;
    if (!stops || stops.length < 2) {
      wb.clearRoute();
      return;
    }
    if (tripTooShort(stops)) {
      wb.clearRoute();
      wb.flyTo(stops[stops.length - 1].lat, stops[stops.length - 1].lon, 16);
      return;
    }
    const routes = mapRoutes.length
      ? mapRoutes
      : [{ id: "direct", points: stops.map((s) => [s.lat, s.lon] as [number, number]) }];
    wb.setRoutes(routes, drive?.id || routes[0]?.id || null, !light && !sat, {
      fit: !navigating && Boolean(drive),
    });
  }, [drive, routeChoices, stops, ready, light, sat, navigating]);

  useEffect(() => {
    const wb = wbRef.current;
    if (!wb || !navigating || !drive || !live) {
      wb?.setRouteProgress(null);
      return;
    }
    wb.setRouteProgress({
      routeId: drive.id,
      index: live.routeIndex,
      point: live.routePoint,
      fraction: live.progress,
    });
  }, [
    navigating,
    drive?.id,
    live?.routeIndex,
    live?.routePoint[0],
    live?.routePoint[1],
    live?.progress,
    ready,
  ]);

  useEffect(() => {
    wbRef.current?.setTraffic(traffic);
  }, [traffic, ready]);

  useEffect(() => {
    if (!ready) return;
    const next = mapKind(light, sat);
    if (kindInit.current) {
      kindInit.current = false;
      if (next === "vector-light") return;
    }
    const o = overlayRef.current;
    wbRef.current?.setKind(next, {
      places: o.filtered,
      darkPins: o.darkPins,
      routes: o.routes,
      selectedRouteId: o.selectedRouteId,
      traffic: o.traffic,
    });
  }, [light, sat, ready]);

  useEffect(() => {
    setGoChrome(navigating);
    if (!navigating) {
      setOffRoute(false);
      setRerouting(false);
      setFollowing(true);
    }
    wbRef.current?.setNav(navigating);
    const t = window.setTimeout(() => wbRef.current?.resize(), 50);
    const onVis = () => {
      if (document.visibilityState === "visible" && navigating) void setWake(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      setGoChrome(false);
    };
  }, [navigating]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const syncHeight = () => {
      const height = viewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--wb-map-vh", `${Math.round(height)}px`);
    };
    syncHeight();
    viewport?.addEventListener("resize", syncHeight);
    window.addEventListener("resize", syncHeight);
    window.addEventListener("orientationchange", syncHeight);
    return () => {
      viewport?.removeEventListener("resize", syncHeight);
      window.removeEventListener("resize", syncHeight);
      window.removeEventListener("orientationchange", syncHeight);
      document.documentElement.style.removeProperty("--wb-map-vh");
    };
  }, []);

  useEffect(() => {
    if (!navigating) {
      compassHeadingRef.current = null;
      return;
    }
    const onOrientation = (event: DeviceOrientationEvent) => {
      const absolute = event as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        absolute?: boolean;
      };
      const iosHeading = absolute.webkitCompassHeading;
      const raw =
        typeof iosHeading === "number"
          ? iosHeading
          : typeof event.alpha === "number"
            ? 360 - event.alpha
            : null;
      if (raw == null || !Number.isFinite(raw)) return;
      const heading = (raw + 360) % 360;
      const previous = compassHeadingRef.current;
      if (previous != null && Math.abs(angleDelta(previous, heading)) <= 3) return;
      compassHeadingRef.current = heading;
      wbRef.current?.orient(heading);
    };
    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener, { passive: true });
    window.addEventListener("deviceorientation", onOrientation, { passive: true });
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation);
      compassHeadingRef.current = null;
    };
  }, [navigating]);

  useEffect(() => {
    const wb = wbRef.current;
    if (!navigating || !wb) {
      setRerouting(false);
      watchRef.current?.clear();
      watchRef.current = null;
      return;
    }
    let gpsState = freshGpsState();
    let rerouteState = freshRerouteState();
    let reroutePending = false;
    let rerouteGeneration = 0;
    let lastUiFix = 0;
    let active = true;
    // Enter the navigation camera immediately with the best known position;
    // GPS fixes will refine it. Waiting for geolocation here made GO feel dead.
    const bootGeom = driveRef.current?.geometry;
    const origin =
      hereRef.current ||
      (bootGeom?.length ? { lat: bootGeom[0][0], lon: bootGeom[0][1] } : null) ||
      (stopsRef.current?.[0] ? { lat: stopsRef.current[0].lat, lon: stopsRef.current[0].lon } : null);
    if (origin) {
      const look =
        bootGeom && bootGeom.length >= 2 ? pointAhead(bootGeom, origin, navLookAheadMeters(null)) : null;
      const br = look ? (bearingDeg(origin, look) + 360) % 360 : null;
      wb.follow(origin.lon, origin.lat, br, {
        camera: look ? { lat: look.lat, lon: look.lon } : origin,
        speed: null,
        accuracy: null,
      });
    }
    const placeMe = (
      lat: number,
      lon: number,
      gpsHeading?: number | null,
      speed?: number | null,
      accuracy = 50,
      timestamp = Date.now(),
    ) => {
      if (!active || !navigatingRef.current) return;
      const filteredFix = filterGpsFix(gpsState, {
        lat,
        lon,
        accuracy,
        heading: gpsHeading,
        speed,
        timestamp,
      });
      if (!filteredFix.accepted || !filteredFix.fix) return;
      gpsState = filteredFix.state;
      const fix = filteredFix.fix;
      const gps = { lat: fix.lat, lon: fix.lon };
      if (!lastUiFix || timestamp - lastUiFix >= 800) {
        lastUiFix = timestamp;
        setHere(gps);
      }
      const geom = driveRef.current?.geometry;
      const tracking = navTrackingTarget(geom || [], gps, fix.accuracy, fix.speed);
      let br = compassHeadingRef.current ?? fix.heading;
      if (
        br == null &&
        tracking.onRoad &&
        (tracking.camera.lat !== tracking.rider.lat || tracking.camera.lon !== tracking.rider.lon)
      ) {
        br = (bearingDeg(tracking.rider, tracking.camera) + 360) % 360;
      }
      wb.follow(tracking.rider.lon, tracking.rider.lat, br, {
        camera: tracking.camera,
        speed: fix.speed,
        accuracy: fix.accuracy,
      });

      if (Number.isFinite(tracking.distanceM)) {
        const decision = updateReroute(rerouteState, {
          now: timestamp,
          distanceM: tracking.distanceM,
          accuracyM: fix.accuracy,
          pending: reroutePending,
        });
        rerouteState = decision.state;
        setOffRoute(decision.offRoute);
        if (decision.trigger) {
          const list = stopsRef.current;
          if (!list || list.length < 2) return;
          reroutePending = true;
          setRerouting(true);
          const generation = ++rerouteGeneration;
          void planRoute([gps, ...list.slice(1)], { ...routingRef.current, alternatives: false }).then((route) => {
            if (!active || generation !== rerouteGeneration) return;
            reroutePending = false;
            setRerouting(false);
            if (route && navigatingRef.current) {
              rerouteState = freshRerouteState();
              setOffRoute(false);
              setDrive(route);
              setRouteChoices([route]);
            }
          });
        }
      }
    };
    getHere().then((p) => {
      if (!active || !navigatingRef.current) return;
      if (p) placeMe(p.lat, p.lon, null, null, 25);
      else if (stops?.[0]) placeMe(stops[0].lat, stops[0].lon, null, null, 25);
    });
    watchRef.current = watchLocation(
      (fix) => placeMe(fix.lat, fix.lon, fix.heading, fix.speed, fix.accuracy, fix.timestamp),
      { timeout: 12_000, maximumAge: 500 },
    );
    return () => {
      active = false;
      rerouteGeneration += 1;
      watchRef.current?.clear();
      watchRef.current = null;
    };
  }, [navigating, stops]);

  useEffect(() => {
    if (!navigating || drive?.provider !== "google" || !drive.trafficAware || !stops || stops.length !== 2) {
      return;
    }
    let active = true;
    const selectedId = drive.id;
    const refreshEta = async () => {
      const current = hereRef.current;
      if (!current) return;
      const refreshed = await planRoute([current, stops[1]], {
        ...routingRef.current,
        alternatives: false,
      });
      if (!active || !refreshed || refreshed.provider !== "google") return;
      setDrive((route) =>
        route?.id === selectedId
          ? { ...route, duration: refreshed.duration, trafficAware: refreshed.trafficAware }
          : route,
      );
      setRouteChoices((routes) =>
        routes.map((route) =>
          route.id === selectedId
            ? { ...route, duration: refreshed.duration, trafficAware: refreshed.trafficAware }
            : route,
        ),
      );
    };
    const timer = window.setInterval(() => void refreshEta(), 180_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [navigating, drive?.id, drive?.provider, drive?.trafficAware, stops]);

  function locate() {
    const wb = wbRef.current;
    const wasNavigating = navigatingRef.current;
    if (wasNavigating) wb?.resumeFollow();
    void readLocation({ timeout: 5_000, maximumAge: 5_000 }).then((fix) => {
      if (wasNavigating && !navigatingRef.current) return;
      if (!fix) {
        const current = hereRef.current;
        if (!wasNavigating && current) wb?.flyTo(current.lat, current.lon, 11);
        return;
      }
      const geo = { lat: fix.lat, lon: fix.lon };
      setHere(geo);
      if (navigatingRef.current) {
        const geom = driveRef.current?.geometry;
        const tracking = navTrackingTarget(geom || [], geo, fix.accuracy, fix.speed);
        wb?.follow(tracking.rider.lon, tracking.rider.lat, wb.map.getBearing(), {
          camera: tracking.camera,
          speed: fix.speed,
          accuracy: fix.accuracy,
        });
      } else {
        wb?.flyTo(geo.lat, geo.lon, Math.max(wb.map.getZoom(), 11));
      }
    });
  }

  function sharePicked() {
    if (!picked) return;
    const text = `${picked.name} — ${picked.city}, ${picked.country}`;
    if (navigator.share) navigator.share({ title: picked.name, text });
    else navigator.clipboard.writeText(text);
  }

  function routeToPicked() {
    if (!picked) return;
    nav(`/map?to=${picked.lat},${picked.lon}&name=${encodeURIComponent(picked.name)}&type=${picked.types[0]}`);
    setPicked(null);
  }

  function shareRoute() {
    if (!stops || !drive) return;
    const text = `${stops[0].label} → ${stops[stops.length - 1].label} · ${formatMeters(drive.distance)} · ${formatDriveTime(drive.duration)}`;
    if (navigator.share) navigator.share({ title: "Route", text });
    else navigator.clipboard.writeText(text);
  }

  async function useMyLocation() {
    const gen = ++pickGen.current;
    const inBuild = buildOpen;
    if (!inBuild) setPickMode("start");
    setLocating(true);
    const geo = await getHere();
    if (gen !== pickGen.current) return;
    setLocating(false);
    if (!geo) return;
    setHere(geo);
    wbRef.current?.flyTo(geo.lat, geo.lon, Math.max(wbRef.current.map.getZoom(), 13));
    if (inBuild) {
      setPickMode("to");
      return;
    }
    setStops((cur) => {
      if (!cur) return cur;
      const next = cur.slice();
      next[0] = { ...geo, label: "My current location", role: "start" };
      return next;
    });
    setPickMode(null);
  }

  function openBuild() {
    setStops(null);
    setDrive(null);
    setPicked(null);
    setBuildTo(null);
    setBuildOpen(true);
    setPickMode("to");
    void getHere().then((geo) => {
      if (!geo || navigatingRef.current) return;
      setHere(geo);
      wbRef.current?.flyTo(geo.lat, geo.lon, Math.max(wbRef.current.map.getZoom(), 13));
    });
  }

  function closeBuild() {
    setBuildOpen(false);
    setBuildTo(null);
    if (pickModeRef.current === "to") setPickMode(null);
  }

  async function confirmBuild() {
    if (!buildTo) return;
    const geo = here || (await getHere());
    const start = geo || buildTo;
    setStops([
      { lat: start.lat, lon: start.lon, label: geo ? "My current location" : "Start", role: "start" },
      { ...buildTo, role: "end" },
    ]);
    setBuildOpen(false);
    setPickMode(null);
  }

  const photos = picked ? photosFor(picked).slice(0, 2) : [];
  const site = picked?.website || (picked ? `https://www.google.com/maps/search/?api=1&query=${picked.lat},${picked.lon}` : "");
  const hudDist = live?.arrived ? 0 : live?.distance ?? drive?.distance ?? 0;
  const hudTime = live?.arrived ? 0 : live?.duration ?? drive?.duration ?? 0;
  const navRouteState: NavRouteState = rerouting ? "rerouting" : offRoute ? "off-route" : "following";
  const canGo = Boolean(drive && drive.distance >= MIN_NAV_METERS);
  const tooShort = Boolean(stops && tripTooShort(stops));

  return (
    <div className={`page map-page${navigating ? " is-nav" : ""}${light || sat ? "" : " is-dark"}${pickMode ? " is-pick" : ""}`}>
      <div className="map-nav-stage">
        <div className="map-wrap full map-gl" ref={mapEl} data-pitch={navigating ? String(NAV_TILT) : "0"} />
        {!online && (
          <div className="map-offline" role="status">
            Map tiles and new routes need an internet connection. Saved places remain available.
          </div>
        )}
      </div>
      {pickMode && !navigating && (
        <div
          className="map-hit"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            pickPtr.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false };
          }}
          onPointerMove={(e) => {
            const s = pickPtr.current;
            if (!s || s.id !== e.pointerId) return;
            const dx = e.clientX - s.x;
            const dy = e.clientY - s.y;
            if (dx * dx + dy * dy > 9) s.dragged = true;
            s.x = e.clientX;
            s.y = e.clientY;
            wbRef.current?.panBy(-dx, -dy);
          }}
          onPointerUp={(e) => {
            const s = pickPtr.current;
            pickPtr.current = null;
            if (!s || s.dragged) return;
            const host = mapEl.current;
            if (!host) return;
            const r = host.getBoundingClientRect();
            wbRef.current?.tapAt(e.clientX - r.left, e.clientY - r.top);
          }}
          onPointerCancel={() => {
            pickPtr.current = null;
          }}
        />
      )}
      {!trip && (
        <div className="map-search">
          <button className="map-round" onClick={() => nav(-1)} aria-label="Back">
            <IconBack />
          </button>
          <label className="map-q">
            <IconSearch />
            <input placeholder="Search the map" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button className="map-round" onClick={() => setInfo(true)} aria-label="About map">
            <IconInfo />
          </button>
        </div>
      )}
      {trip && !navigating && (
        <div className={`route-ab${viaOpen ? " open" : ""}`}>
          {(() => {
            const list = stops!;
            const start = list[0];
            const end = list[list.length - 1];
            const vias = list.slice(1, -1);
            const rows = viaOpen || vias.length === 0 ? list : [start];
            return (
              <>
                {rows.map((s, i) => (
                  <button
                    key={`${s.role}-${i}-${s.label}`}
                    type="button"
                    className="route-stop"
                    data-stop={s.role}
                    onClick={() => {
                      if (s.role === "start") void useMyLocation();
                    }}
                  >
                    <span className={`route-dot ${s.role}`}>{s.role === "via" ? i : ""}</span>
                    <div>
                      <b>{s.label}</b>
                      {s.role === "start" && (
                        <span>{locating ? "Locating…" : pickMode === "start" ? "Tap the map or wait for GPS" : "Tap to change"}</span>
                      )}
                    </div>
                  </button>
                ))}
                {!viaOpen && vias.length > 0 && (
                  <button type="button" className="route-stop" onClick={() => setViaOpen(true)}>
                    <span className="route-dot via">⚑</span>
                    <div>
                      <b>
                        {vias.length} stop{vias.length === 1 ? "" : "s"}
                      </b>
                    </div>
                  </button>
                )}
                {!viaOpen && vias.length > 0 && (
                  <button type="button" className="route-stop" onClick={() => setViaOpen(true)}>
                    <span className="route-dot end" />
                    <div>
                      <b>{end.label}</b>
                    </div>
                  </button>
                )}
                {viaOpen && vias.length > 0 && (
                  <button type="button" className="route-stop via-hide" onClick={() => setViaOpen(false)}>
                    <span className="route-dot via">–</span>
                    <div>
                      <b>Hide stops</b>
                    </div>
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
      {pickMode && !navigating && !buildOpen && (
        <div className="route-hint">
          {pickMode === "start"
            ? "Tap the map to set start"
            : pickMode === "to"
              ? "Tap the map to set destination"
              : "Tap the map to add a waypoint"}
        </div>
      )}
      {navigating && drive && (
        <NavHud
          primary={maneuvers[0]}
          upcoming={maneuvers.slice(1)}
          routeState={navRouteState}
          following={following}
          muted={voiceMuted}
          arrived={Boolean(live?.arrived)}
          remainingTime={hudTime}
          remainingDistance={hudDist}
          progress={live?.progress ?? 0}
          onToggleMute={() => setVoiceMuted((current) => !current)}
          onRecenter={locate}
          onExit={stopNavigation}
        />
      )}
      {!navigating && <div className={`map-tools${trip ? " route-tools" : ""}`}>
        {!trip && !navigating && (
          <button type="button" className={`map-round${buildOpen ? " on" : ""}`} onClick={openBuild} aria-label="Build route">
            <IconRouteBuild />
          </button>
        )}
        <button
          className="map-round"
          onClick={() => {
            setDraftOn(on);
            setDraftFriendly(friendly);
            setFilters(true);
          }}
          aria-label="filters"
        >
          <IconFilter />
        </button>
        <button
          type="button"
          className="map-round"
          data-testid="map-theme"
          data-theme-mode={themeMode}
          onClick={() =>
            setThemeMode((mode) => (mode === "light" ? "dark" : mode === "dark" ? "auto" : "light"))
          }
          aria-label="map theme"
          title={`Theme: ${themeMode}`}
        >
          {themeMode === "auto" ? <span className="theme-auto">A</span> : light ? <IconSun /> : <IconMoon />}
        </button>
        <button className="map-round" onClick={() => wbRef.current?.zoomBy(1)} aria-label="Zoom in">
          +
        </button>
        <button className="map-round" onClick={() => wbRef.current?.zoomBy(-1)} aria-label="Zoom out">
          −
        </button>
        <button className="map-round" onClick={locate} aria-label="My location">
          <IconLocate />
        </button>
      </div>}
      {buildOpen && !trip && !navigating && (
        <div className="build-sheet">
          <div className="build-sheet-top">
            <div>
              <h3>Build route</h3>
              <p>Tap map or place</p>
            </div>
            <button type="button" className="route-share" onClick={closeBuild} aria-label="Close">
              ×
            </button>
          </div>
          <button type="button" className="build-stop" onClick={() => void useMyLocation()}>
            <span className="build-pin from" />
            <div>
              <b>My current location</b>
              <span>{locating || !here ? "Locating…" : "From"}</span>
            </div>
          </button>
          <button type="button" className="build-stop" onClick={() => setPickMode("to")}>
            <span className="build-pin to" />
            <div>
              <b>{buildTo?.label || "Destination"}</b>
              <span>{buildTo ? "Tap to change" : "Tap a place or press on map"}</span>
            </div>
          </button>
          <button type="button" className="btn green build-go" disabled={!buildTo} onClick={() => void confirmBuild()}>
            <IconTurn />
            Build route
          </button>
        </div>
      )}
      {trip && !navigating && drive && (
        <div className="route-sheet">
          <div className="route-sheet-top">
            <div>
              <p className="route-time">{formatDriveTime(drive.duration)}</p>
              <p className="route-meta">
                {formatArrival(drive.duration)}
                <br />
                {formatMeters(drive.distance)}
              </p>
            </div>
            <button className="route-share" onClick={shareRoute} aria-label="Share">
              <IconShare />
            </button>
          </div>
          <div className="route-profiles" aria-label="Route profile">
            {([
              ["fastest", "Fastest"],
              ["scenic", "Scenic"],
              ["no-highways", "No highways"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={profile === value ? "on" : ""}
                onClick={() => setProfile(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {routeChoices.length > 1 && (
            <div className="route-alternatives" aria-label="Route alternatives">
              {routeChoices.map((route, index) => (
                <button
                  key={route.id}
                  type="button"
                  className={drive.id === route.id ? "on" : ""}
                  onClick={() => setDrive(route)}
                >
                  <b>{index === 0 ? "Recommended" : `Route ${index + 1}`}</b>
                  <span>{formatDriveTime(route.duration)} · {formatMeters(route.distance)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="route-source">
            <span>{drive.provider === "google" ? "Google" : "OSM"}</span>
            {drive.trafficAware && <span>Traffic ETA</span>}
            {drive.profile !== "fastest" && <span>Motorcycle preference</span>}
          </div>
          <div className="route-options">
            <label className="route-toll">
              Toll roads
              <button type="button" className={`sw${tolls ? " on" : ""}`} onClick={() => setTolls((v) => !v)} aria-label="Toll roads">
                <i />
              </button>
            </label>
            <label className="route-toll">
              Ferries
              <button type="button" className={`sw${ferries ? " on" : ""}`} onClick={() => setFerries((v) => !v)} aria-label="Ferries">
                <i />
              </button>
            </label>
            <label className="route-toll">
              Paved roads
              <button type="button" className={`sw${pavedOnly ? " on" : ""}`} onClick={() => setPavedOnly((v) => !v)} aria-label="Paved roads">
                <i />
              </button>
            </label>
            <label className="route-toll">
              Traffic
              <button type="button" className={`sw${traffic ? " on" : ""}`} onClick={() => setTraffic((v) => !v)} aria-label="Traffic">
                <i />
              </button>
            </label>
          </div>
          <div className="route-actions">
            <button
              className="btn green route-go"
              disabled={!canGo}
              onClick={() => {
                if (!canGo) return;
                requestCompassAccess();
                const generation = ++goStartGen.current;
                navigatingRef.current = true;
                setNavigating(true);
                void getHere().then((geo) => {
                  if (generation !== goStartGen.current || !navigatingRef.current) return;
                  const currentStops = stopsRef.current;
                  if (geo && currentStops && haversineKm(geo, currentStops[0]) > 0.25) {
                    setStops(applyGpsStart(currentStops, geo));
                  }
                });
              }}
            >
              <IconGo />
              GO!
            </button>
            <button
              type="button"
              className={`btn white route-add${pickMode === "via" ? " on" : ""}`}
              onClick={() => setPickMode("via")}
            >
              <IconPlus />
              Add waypoint
            </button>
          </div>
        </div>
      )}
      {trip && !navigating && tooShort && (
        <div className="route-sheet">
          <p className="route-meta" style={{ margin: 0 }}>
            You&apos;re already there. Tap the start field or the map to choose a different starting point.
          </p>
        </div>
      )}
      {trip && !navigating && routingErr && !drive && !tooShort && (
        <div className="route-sheet">
          <p className="route-meta" style={{ margin: 0 }}>
            Couldn&apos;t snap this trip to roads. Change the start point or try again.
          </p>
        </div>
      )}
      {picked && !trip && (
        <div className="map-place">
          <div className="map-place-top">
            <div>
              <div className="map-place-title">{picked.name}</div>
              <Stars value={picked.rating} />
              <div className="map-place-cat">{TYPE_CHIP[picked.types[0]]}</div>
            </div>
            <div className="map-place-icos">
              <button className="map-mini" onClick={sharePicked} aria-label="Share">
                <IconShare />
              </button>
              <button className="map-mini" onClick={() => nav(`/object/${picked.id}`)} aria-label="Open place">
                <IconMenu />
              </button>
            </div>
          </div>
          <div className="map-place-btns">
            <button className="btn green" onClick={routeToPicked}>
              <IconTurn />
              Route
            </button>
            <a className="btn white" href={site} target="_blank" rel="noreferrer">
              <IconGlobe />
              Site
            </a>
          </div>
          {photos.length > 0 && (
            <div className="map-place-photos">
              {photos.map((src) => (
                <PlacePhoto key={src} src={src} alt="" />
              ))}
            </div>
          )}
        </div>
      )}
      {filters &&
        createPortal(
          <>
            <div className="backdrop map-overlay" onClick={() => setFilters(false)} />
            <div className="country-sheet map-overlay">
              <div className="sheet-handle" />
              <div className="map-chips">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={draftOn[t] ? "on" : ""}
                    onClick={() => setDraftOn((prev) => ({ ...prev, [t]: !prev[t] }))}
                  >
                    {TYPE_CHIP[t]}
                  </button>
                ))}
                <button
                  type="button"
                  className={`friendly ${draftFriendly ? "on" : ""}`}
                  onClick={() => setDraftFriendly((v) => !v)}
                >
                  Bikers Friendly
                </button>
              </div>
              <div className="filter-foot">
                <button
                  type="button"
                  className="clear-all"
                  onClick={() => {
                    setDraftOn(Object.fromEntries(TYPES.map((t) => [t, false])));
                    setDraftFriendly(false);
                  }}
                >
                  Clear all
                </button>
                <button
                  type="button"
                  className="apply-txt"
                  onClick={() => {
                    setOn(draftOn);
                    setFriendly(draftFriendly);
                    setFilters(false);
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
      {info &&
        createPortal(
          <div className="map-legend map-overlay" onClick={() => setInfo(false)}>
            <div className="map-legend-inner" onClick={(e) => e.stopPropagation()}>
              <p className="map-tip">
                <span className="tip-i">i</span>
                Leave a quick rating or review after your visit. This helps other riders and keeps the map useful for
                planning the best biker routes!
              </p>
              <p>
                <b>Black pins:</b> Places recommended by real bikers. These are tested and trusted by biker
                community.
              </p>
              <p>
                <b>Red pins:</b> Biker-friendly partners. They often offer discounts, gifts or special
                service for Welcome Bikers users.
              </p>
              <p>
                <b>Search by name</b> — find hotels, restaurants or any place you want.
              </p>
              <p>
                <b>Filters</b> — show only what you need: biker bars, service stations, festivals, motels, rentals, and
                more.
              </p>
              <button className="btn ghost" onClick={() => setInfo(false)}>
                Ok
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

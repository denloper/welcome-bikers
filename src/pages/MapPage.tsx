import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import {
  IconBack,
  IconFilter,
  IconGlobe,
  IconGo,
  IconInfo,
  IconLayers,
  IconLocate,
  IconMenu,
  IconMoon,
  IconPlus,
  IconSearch,
  IconShare,
  IconSun,
  IconTurn,
} from "../components/Icons";
import { Stars } from "../components/Stars";
import { PlacePhoto } from "../components/PlacePhoto";
import { loadPlaces } from "../lib/data";
import { asset } from "../lib/assets";
import { bearingDeg, haversineKm, nearestIndex, pointAhead, validCoords } from "../lib/geo";
import { MIN_NAV_METERS, remainingAlong, tripTooShort } from "../lib/nav";
import { darkTiles, lightTiles, satTiles } from "../lib/osm";
import {
  formatArrival,
  formatDriveTime,
  formatMeters,
  osrmRoute,
  stepThen,
  stepToward,
  type DriveRoute,
  type NavStep,
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

function pinIcon(type: PlaceType, friendly = false, darkPins = false) {
  const tone = friendly ? "friendly" : darkPins ? "white" : "black";
  return L.icon({
    className: "wb-pin",
    iconUrl: asset(`pins/${tone}/${type}.svg`),
    iconSize: [30, 40],
    iconAnchor: [15, 40],
  });
}

function navArrowIcon() {
  return L.divIcon({
    className: "wb-me",
    html: `<span class="wb-nav-chevron"><svg viewBox="0 0 24 32" width="26" height="34"><path d="M12 2 L22 30 L12 23 L2 30 Z" fill="#3d8aff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 26],
  });
}

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

function getHere(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 15_000 },
    );
  });
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

function TurnArrow({ turn }: { turn: string }) {
  const t = turn.toLowerCase();
  let d = "M12 20V6M12 6l-5 5M12 6l5 5";
  if (t.includes("left")) d = "M18 12H6M6 12l5-5M6 12l5 5";
  else if (t.includes("right")) d = "M6 12h12M18 12l-5-5M18 12l-5 5";
  else if (t.includes("uturn") || t.includes("u-turn")) d = "M8 18V10a4 4 0 0 1 8 0v2M8 18l-3-3M8 18l3-3";
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d={d} />
    </svg>
  );
}

function setGoChrome(on: boolean) {
  document.body.classList.toggle("wb-nav-go", on);
  document.querySelector(".app")?.classList.toggle("no-nav", on);
}

export function MapPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const osmRef = useRef<L.TileLayer | null>(null);
  const lightRef = useRef<L.TileLayer | null>(null);
  const satRef = useRef<L.TileLayer | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const endsRef = useRef<L.LayerGroup | null>(null);
  const meRef = useRef<L.Marker | null>(null);
  const watchRef = useRef<number | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [q, setQ] = useState("");
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(TYPES.map((t) => [t, true])));
  const [friendly, setFriendly] = useState(false);
  const [draftOn, setDraftOn] = useState(on);
  const [draftFriendly, setDraftFriendly] = useState(false);
  const [filters, setFilters] = useState(false);
  const [info, setInfo] = useState(false);
  const [light, setLight] = useState(true);
  const [sat, setSat] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [picked, setPicked] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);
  const [stops, setStops] = useState<Stop[] | null>(null);
  const [tolls, setTolls] = useState(false);
  const [drive, setDrive] = useState<DriveRoute | null>(null);
  const driveRef = useRef<DriveRoute | null>(null);
  driveRef.current = drive;
  const [routingErr, setRoutingErr] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [pickMode, setPickMode] = useState<null | "start" | "via">(null);
  const [viaOpen, setViaOpen] = useState(false);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const pickGen = useRef(0);

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
  const live = navigating && drive ? remainingAlong(drive, here || { lat: stops![0].lat, lon: stops![0].lon }) : null;
  const nowStep: NavStep | undefined = drive?.steps[live?.stepI ?? 0];
  const nextStep: NavStep | undefined = drive?.steps[(live?.stepI ?? 0) + 1];
  const then = stepThen(nextStep);

  useEffect(() => {
    loadPlaces().then(setPlaces);
  }, []);

  useEffect(() => {
    if (!mapEl.current) return;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false }).setView([45.1, 16.5], 5);
    const dark = darkTiles(0);
    const day = lightTiles().addTo(map);
    const satLayer = satTiles();
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    osmRef.current = dark;
    lightRef.current = day;
    satRef.current = satLayer;
    endsRef.current = L.layerGroup().addTo(map);
    setReady(true);
    const resize = () => map.invalidateSize();
    const t = window.setTimeout(resize, 80);
    const t2 = window.setTimeout(resize, 400);
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.removeEventListener("resize", resize);
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      endsRef.current = null;
      satRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const dark = osmRef.current;
    const day = lightRef.current;
    const satLayer = satRef.current;
    if (!map || !dark || !day || !satLayer || !ready) return;
    const show = sat ? satLayer : light ? day : dark;
    for (const layer of [dark, day, satLayer]) {
      if (layer === show) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }
  }, [light, sat, ready]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster || !ready) return;
    cluster.clearLayers();
    filtered.forEach((p) => {
      const marker = L.marker([p.lat, p.lon], {
        title: p.name,
        icon: pinIcon(p.types[0], p.bikersFriendly, darkPins),
      });
      marker.on("click", () => {
        if (pickMode === "via") {
          setStops((cur) => {
            if (!cur || cur.length < 2) return cur;
            const next = cur.slice();
            next.splice(next.length - 1, 0, { lat: p.lat, lon: p.lon, label: p.name, role: "via" });
            return next;
          });
          setPickMode(null);
          return;
        }
        if (pickMode === "start") {
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
      });
      cluster.addLayer(marker);
    });
  }, [filtered, ready, pickMode, darkPins]);

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
          setNavigating(false);
        }
        return;
      }
      setPicked(null);
      setNavigating(false);
      if (via.length >= 2) {
        const built: Stop[] = via.map((p, i) => {
          const hit = nearestPlace(places, p.lat, p.lon);
          const role: Stop["role"] = i === 0 ? "start" : i === via.length - 1 ? "end" : "via";
          let label = hit?.name || `Stop ${i + 1}`;
          if (i === via.length - 1 && named) label = named;
          return { ...p, label, role };
        });
        if (!cancelled) setStops(built);
        return;
      }
      const dest = to[0];
      const hit = nearestPlace(places, dest.lat, dest.lon);
      const end: Stop = {
        ...dest,
        label: named || hit?.name || "Destination",
        role: "end",
      };
      const geo = await getHere();
      if (cancelled) return;
      const start: Stop = geo
        ? { ...geo, label: "My current location", role: "start" }
        : { ...dest, label: "My current location", role: "start" };
      if (!geo) setPickMode("start");
      setStops([start, end]);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [params, ready, places]);

  useEffect(() => {
    if (!ready || !stops || stops.length < 2) {
      setDrive(null);
      setRoutingErr(false);
      return;
    }
    if (tripTooShort(stops)) {
      setDrive(null);
      setRoutingErr(false);
      return;
    }
    let cancelled = false;
    osrmRoute(stops, { excludeToll: !tolls }).then((route) => {
      if (cancelled) return;
      setDrive(route);
      setRoutingErr(!route);
    });
    return () => {
      cancelled = true;
    };
  }, [stops, tolls, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !stops || stops.length < 2) {
      lineRef.current?.remove();
      lineRef.current = null;
      endsRef.current?.clearLayers();
      return;
    }
    lineRef.current?.remove();
    endsRef.current?.clearLayers();
    const start = stops[0];
    const end = stops[stops.length - 1];
    if (tripTooShort(stops)) {
      if (!navigating) {
        L.circleMarker([start.lat, start.lon], {
          radius: 8,
          color: "#fff",
          weight: 2,
          fillColor: "#3d8aff",
          fillOpacity: 1,
        }).addTo(endsRef.current!);
        const endPlace = nearestPlace(places, end.lat, end.lon);
        L.marker([end.lat, end.lon], {
          icon: pinIcon(endPlace?.types[0] || "hotels", Boolean(endPlace?.bikersFriendly), !light && !sat),
          interactive: false,
        }).addTo(endsRef.current!);
        map.setView([end.lat, end.lon], 16, { animate: false });
      }
      return;
    }
    const latlngs = drive?.geometry.length
      ? drive.geometry
      : stops.map((s) => [s.lat, s.lon] as [number, number]);
    const line = L.polyline(latlngs, {
      color: "#3d8aff",
      weight: navigating ? 7 : drive ? 6 : 4,
      opacity: 0.95,
      dashArray: drive ? undefined : "8 10",
    }).addTo(map);
    lineRef.current = line;
    if (navigating) return;
    L.circleMarker([start.lat, start.lon], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: "#3d8aff",
      fillOpacity: 1,
    }).addTo(endsRef.current!);
    const endPlace = nearestPlace(places, end.lat, end.lon);
    L.marker([end.lat, end.lon], {
      icon: pinIcon(endPlace?.types[0] || "hotels", Boolean(endPlace?.bikersFriendly), !light && !sat),
      interactive: false,
    }).addTo(endsRef.current!);
    map.fitBounds(line.getBounds(), { paddingTopLeft: [24, 130], paddingBottomRight: [56, 250] });
  }, [drive, stops, navigating, ready, places, light, sat]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !pickMode) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      const hit = nearestPlace(places, e.latlng.lat, e.latlng.lng);
      const label = hit?.name || `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
      if (pickMode === "start") {
        pickGen.current += 1;
        setLocating(false);
        setStops((cur) => {
          if (!cur) return cur;
          const next = cur.slice();
          next[0] = { lat: e.latlng.lat, lon: e.latlng.lng, label: hit?.name || "My current location", role: "start" };
          return next;
        });
      } else {
        setStops((cur) => {
          if (!cur || cur.length < 2) return cur;
          const next = cur.slice();
          next.splice(next.length - 1, 0, { lat: e.latlng.lat, lon: e.latlng.lng, label, role: "via" });
          return next;
        });
      }
      setPickMode(null);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [pickMode, ready, places]);

  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !ready) return;
    if (navigating) {
      if (cluster && map.hasLayer(cluster)) map.removeLayer(cluster);
    } else {
      if (cluster && !map.hasLayer(cluster)) map.addLayer(cluster);
    }
    const refresh = () => map.invalidateSize();
    refresh();
    const t = window.setTimeout(refresh, 60);
    const t2 = window.setTimeout(refresh, 280);
    const t3 = window.setTimeout(refresh, 600);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [navigating, ready]);

  useEffect(() => {
    setGoChrome(navigating);
    return () => setGoChrome(false);
  }, [navigating]);

  useEffect(() => {
    const map = mapRef.current;
    if (!navigating || !map) {
      if (watchRef.current != null) {
        navigator.geolocation?.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      meRef.current?.remove();
      meRef.current = null;
      return;
    }
    const placeMe = (lat: number, lon: number, gpsHeading?: number | null) => {
      const gps = { lat, lon };
      setHere(gps);
      const geom = driveRef.current?.geometry;
      let follow = gps;
      if (geom && geom.length >= 2) {
        const i = nearestIndex(geom, gps);
        const dist = haversineKm(gps, { lat: geom[i][0], lon: geom[i][1] });
        if (dist > 0.8) follow = { lat: geom[0][0], lon: geom[0][1] };
      }
      let br = gpsHeading != null && Number.isFinite(gpsHeading) && gpsHeading >= 0 ? gpsHeading : null;
      let look = follow;
      if (geom && geom.length >= 2) {
        look = pointAhead(geom, follow, 80);
        if (br == null) br = (bearingDeg(follow, look) + 360) % 360;
      }
      if (br != null) {
        const needle = meRef.current?.getElement()?.querySelector(".wb-nav-chevron") as HTMLElement | null;
        if (needle) needle.style.transform = `rotate(${br}deg)`;
      }
      if (!meRef.current) {
        meRef.current = L.marker([follow.lat, follow.lon], { icon: navArrowIcon(), zIndexOffset: 1200 }).addTo(map);
        const needle = meRef.current.getElement()?.querySelector(".wb-nav-chevron") as HTMLElement | null;
        if (needle && br != null) needle.style.transform = `rotate(${br}deg)`;
      } else {
        meRef.current.setLatLng([follow.lat, follow.lon]);
      }
      map.setView([follow.lat, follow.lon], Math.max(map.getZoom(), 16), { animate: false });
    };
    getHere().then((p) => {
      if (p) placeMe(p.lat, p.lon);
      else if (stops?.[0]) placeMe(stops[0].lat, stops[0].lon);
    });
    if (navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => placeMe(pos.coords.latitude, pos.coords.longitude, pos.coords.heading),
        () => {},
        { enableHighAccuracy: true, maximumAge: 800 },
      );
    }
    return () => {
      if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [navigating, stops]);

  function locate() {
    const map = mapRef.current;
    if (!map) return;
    const zoom = navigating ? 16 : Math.max(map.getZoom(), 11);
    const fallback = meRef.current?.getLatLng() || here || (stops ? { lat: stops[0].lat, lon: stops[0].lon } : null);
    if (fallback) map.setView([fallback.lat, fallback.lon], zoom, { animate: false });
    navigator.geolocation?.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], zoom, { animate: false }),
      () => {},
      { timeout: 5000, enableHighAccuracy: true, maximumAge: 5000 },
    );
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
    setPickMode("start");
    setLocating(true);
    const geo = await getHere();
    if (gen !== pickGen.current) return;
    setLocating(false);
    if (!geo) return;
    setStops((cur) => {
      if (!cur) return cur;
      const next = cur.slice();
      next[0] = { ...geo, label: "My current location", role: "start" };
      return next;
    });
    setPickMode(null);
  }

  const photos = picked ? photosFor(picked).slice(0, 2) : [];
  const site = picked?.website || (picked ? `https://www.google.com/maps/search/?api=1&query=${picked.lat},${picked.lon}` : "");
  const hudDist = live?.arrived ? 0 : live?.distance ?? drive?.distance ?? 0;
  const hudTime = live?.arrived ? 0 : live?.duration ?? drive?.duration ?? 0;
  const canGo = Boolean(drive && drive.distance >= MIN_NAV_METERS);
  const tooShort = Boolean(stops && tripTooShort(stops));

  return (
    <div className={`page map-page${navigating ? " is-nav" : ""}${light || sat ? "" : " is-dark"}${pickMode ? " is-pick" : ""}`}>
      <div className="map-nav-stage">
        <div className="map-wrap full" ref={mapEl} />
      </div>
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
                {(!viaOpen && vias.length > 0) && (
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
      {pickMode && !navigating && (
        <div className="route-hint">{pickMode === "start" ? "Tap the map to set start" : "Tap the map to add a waypoint"}</div>
      )}
      {navigating && drive && (
        <>
          <div className="nav-banner">
            <TurnArrow turn={nowStep?.modifier || "straight"} />
            <span>{stepToward(nowStep)}</span>
          </div>
          {then && (
            <div className="nav-then">
              <span>{then.label}</span>
              <TurnArrow turn={then.turn} />
            </div>
          )}
        </>
      )}
      <div className={`map-tools${trip && !navigating ? " route-tools" : ""}`}>
        {!trip && (
          <div className="map-tool-wrap">
            <button
              className={`map-round${sat ? " on" : ""}`}
              onClick={() => setLayersOpen((v) => !v)}
              aria-label="Map layers"
            >
              <IconLayers />
            </button>
            {layersOpen && (
              <div className="map-layer-menu">
                <button
                  type="button"
                  className={!sat ? "on" : ""}
                  onClick={() => {
                    setSat(false);
                    setLayersOpen(false);
                  }}
                >
                  Map
                </button>
                <button
                  type="button"
                  className={sat ? "on" : ""}
                  onClick={() => {
                    setSat(true);
                    setLayersOpen(false);
                  }}
                >
                  Satellite
                </button>
              </div>
            )}
          </div>
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
          className="map-round"
          onClick={() => {
            if (sat) {
              setSat(false);
              setLight(true);
            } else {
              setLight((v) => !v);
            }
          }}
          aria-label="map theme"
        >
          {light && !sat ? <IconSun /> : <IconMoon />}
        </button>
        <button className="map-round" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">
          +
        </button>
        <button className="map-round" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">
          −
        </button>
        <button className="map-round" onClick={locate} aria-label="My location">
          <IconLocate />
        </button>
      </div>
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
          <label className="route-toll">
            Toll roads
            <button type="button" className={`sw${tolls ? " on" : ""}`} onClick={() => setTolls((v) => !v)} aria-label="Toll roads">
              <i />
            </button>
          </label>
          <div className="route-actions">
            <button
              className="btn green route-go"
              disabled={!canGo}
              onClick={() => {
                if (!canGo) return;
                setGoChrome(true);
                setNavigating(true);
              }}
            >
              <IconGo />
              GO!
            </button>
            <button className="btn white route-add" onClick={() => setPickMode("via")}>
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
      {navigating && drive && (
        <div className="nav-hud">
          <div>
            <p className="nav-hud-time">{live?.arrived ? "Now" : formatDriveTime(hudTime)}</p>
            <p className="nav-hud-km">{formatMeters(hudDist)}</p>
          </div>
          <button
            className="nav-exit"
            onClick={() => {
              setGoChrome(false);
              setNavigating(false);
            }}
          >
            EXIT
          </button>
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

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { bearingDeg, haversineKm, pointAhead, validCoords } from "../lib/geo";
import { addDarkTiles, lightTiles } from "../lib/osm";
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

const RED: Partial<Record<PlaceType, boolean>> = {
  shops: true,
  services: true,
  festivals: true,
};

type Stop = { lat: number; lon: number; label: string; role: "start" | "via" | "end" };

function pinIcon(type: PlaceType) {
  const src = asset(`icons/${type}.png`);
  const tone = RED[type] ? "red" : "white";
  return L.divIcon({
    className: "wb-pin",
    html: `<span class="wb-pin-wrap ${tone} drop"><img src="${src}" alt="" width="18" height="18"/></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
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
      { timeout: 5000, maximumAge: 30_000 },
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

function remainingAlong(route: DriveRoute, here: { lat: number; lon: number }) {
  const pts = route.geometry;
  const last = pts[pts.length - 1];
  const nearEnd = last && haversineKm(here, { lat: last[0], lon: last[1] }) < 0.08;
  if (nearEnd) return { distance: 0, duration: 0, stepI: Math.max(0, route.steps.length - 1) };
  if (pts.length < 2) return { distance: route.distance, duration: route.duration, stepI: 0 };
  let bestI = 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const km = haversineKm(here, { lat: pts[i][0], lon: pts[i][1] });
    if (km < best) {
      best = km;
      bestI = i;
    }
  }
  if (best > 0.8) {
    return { distance: route.distance, duration: route.duration, stepI: 0 };
  }
  let rest = 0;
  for (let i = bestI; i < pts.length - 1; i++) {
    rest += haversineKm({ lat: pts[i][0], lon: pts[i][1] }, { lat: pts[i + 1][0], lon: pts[i + 1][1] }) * 1000;
  }
  const ratio = route.distance > 0 ? rest / route.distance : 1;
  const traveled = route.distance - rest;
  let acc = 0;
  let stepI = 0;
  for (let i = 0; i < route.steps.length; i++) {
    acc += route.steps[i].distance;
    if (acc >= traveled) {
      stepI = i;
      break;
    }
    stepI = i;
  }
  return { distance: rest, duration: route.duration * ratio, stepI };
}

export function MapPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const osmRef = useRef<L.TileLayer | null>(null);
  const lightRef = useRef<L.TileLayer | null>(null);
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
  const [light, setLight] = useState(false);
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
  const [heading, setHeading] = useState<number | null>(null);

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
    addDarkTiles(map, osmRef);
    const lightLayer = lightTiles();
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    lightRef.current = lightLayer;
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
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const dark = osmRef.current;
    const day = lightRef.current;
    if (!map || !dark || !day || !ready) return;
    if (light) {
      if (map.hasLayer(dark)) map.removeLayer(dark);
      if (!map.hasLayer(day)) day.addTo(map);
    } else {
      if (map.hasLayer(day)) map.removeLayer(day);
      if (!map.hasLayer(dark)) dark.addTo(map);
    }
  }, [light, ready]);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster || !ready) return;
    cluster.clearLayers();
    filtered.forEach((p) => {
      const marker = L.marker([p.lat, p.lon], {
        title: p.name,
        icon: pinIcon(p.types[0]),
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
  }, [filtered, ready, pickMode]);

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
    const map = mapRef.current;
    if (!map || !ready || !stops || stops.length < 2) {
      lineRef.current?.remove();
      lineRef.current = null;
      endsRef.current?.clearLayers();
      return;
    }
    let cancelled = false;
    async function draw() {
      const route = await osrmRoute(stops!, { excludeToll: !tolls });
      if (cancelled) return;
      lineRef.current?.remove();
      endsRef.current?.clearLayers();
      setDrive(route);
      setRoutingErr(!route);
      const latlngs = route?.geometry.length
        ? route.geometry
        : stops!.map((s) => [s.lat, s.lon] as [number, number]);
      const line = L.polyline(latlngs, {
        color: "#3d8aff",
        weight: route ? 6 : 4,
        opacity: 0.95,
        dashArray: route ? undefined : "8 10",
      }).addTo(map);
      lineRef.current = line;
      const start = stops![0];
      const end = stops![stops!.length - 1];
      L.circleMarker([start.lat, start.lon], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#3d8aff",
        fillOpacity: 1,
      }).addTo(endsRef.current!);
      const endPlace = nearestPlace(places, end.lat, end.lon);
      L.marker([end.lat, end.lon], {
        icon: pinIcon(endPlace?.types[0] || "hotels"),
        interactive: false,
      }).addTo(endsRef.current!);
      map.fitBounds(line.getBounds(), { paddingTopLeft: [24, 130], paddingBottomRight: [56, 250] });
    }
    draw();
    return () => {
      cancelled = true;
    };
  }, [stops, tolls, ready, places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !pickMode) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      const hit = nearestPlace(places, e.latlng.lat, e.latlng.lng);
      const label = hit?.name || `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
      if (pickMode === "start") {
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
      map.invalidateSize();
    } else {
      if (cluster && !map.hasLayer(cluster)) map.addLayer(cluster);
      map.invalidateSize();
    }
  }, [navigating, ready]);

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
      const herePt = { lat, lon };
      setHere(herePt);
      const geom = driveRef.current?.geometry;
      let br = gpsHeading != null && Number.isFinite(gpsHeading) && gpsHeading >= 0 ? gpsHeading : null;
      let look = herePt;
      if (geom && geom.length >= 2) {
        look = pointAhead(geom, herePt, 90);
        if (br == null) br = (bearingDeg(herePt, look) + 360) % 360;
      }
      if (br != null) setHeading(br);
      if (!meRef.current) {
        meRef.current = L.marker([lat, lon], { icon: navArrowIcon(), zIndexOffset: 1200 }).addTo(map);
      } else {
        meRef.current.setLatLng([lat, lon]);
      }
      const z = Math.max(map.getZoom(), 17);
      map.setView([look.lat, look.lon], z, { animate: true });
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
    navigator.geolocation?.getCurrentPosition((pos) => {
      mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 11);
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
    const geo = await getHere();
    if (!geo) {
      setPickMode("start");
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

  const photos = picked ? photosFor(picked).slice(0, 2) : [];
  const site = picked?.website || (picked ? `https://www.google.com/maps/search/?api=1&query=${picked.lat},${picked.lon}` : "");
  const hudDist = live?.distance ?? drive?.distance ?? 0;
  const hudTime = live?.duration ?? drive?.duration ?? 0;

  return (
    <div className={`page map-page${navigating ? " is-nav" : ""}`}>
      <div
        className="map-wrap full"
        ref={mapEl}
        style={navigating ? ({ ["--nav-rot"]: `${-(heading ?? 0)}deg` } as CSSProperties) : undefined}
      />
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
                    onClick={() => {
                      if (s.role === "start") useMyLocation();
                    }}
                  >
                    <span className={`route-dot ${s.role}`}>{s.role === "via" ? i : ""}</span>
                    <div>
                      <b>{s.label}</b>
                      {s.role === "start" && <span>Tap to change</span>}
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
        {!navigating && (
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
        )}
        <button className="map-round" onClick={() => setLight((v) => !v)} aria-label="map theme">
          {light ? <IconMoon /> : <IconSun />}
        </button>
        {!trip && (
          <>
            <button className="map-round" onClick={() => mapRef.current?.zoomIn()}>
              +
            </button>
            <button className="map-round" onClick={() => mapRef.current?.zoomOut()}>
              −
            </button>
            <button className="map-round" onClick={locate} aria-label="My location">
              <IconLocate />
            </button>
          </>
        )}
        {navigating && (
          <button
            className="map-round"
            onClick={() => here && mapRef.current?.setView([here.lat, here.lon], 17)}
            aria-label="Recenter"
          >
            <IconLocate />
          </button>
        )}
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
            <button className="btn green route-go" onClick={() => setNavigating(true)}>
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
      {trip && !navigating && routingErr && !drive && (
        <div className="route-sheet">
          <p className="route-meta" style={{ margin: 0 }}>
            Couldn&apos;t snap this trip to roads. Change the start point or try again.
          </p>
        </div>
      )}
      {navigating && drive && (
        <div className="nav-hud">
          <div>
            <p className="nav-hud-time">{formatDriveTime(hudTime)}</p>
            <p className="nav-hud-km">{formatMeters(hudDist)}</p>
          </div>
          <button className="nav-exit" onClick={() => setNavigating(false)}>
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
                <b>Black or white pins:</b> Places recommended by real bikers. These are tested and trusted by biker
                community.
              </p>
              <p>
                <b>Red pins:</b> Our official partners. They are biker-friendly and often offer discounts, gifts or special
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

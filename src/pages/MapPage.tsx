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
  IconInfo,
  IconLocate,
  IconMenu,
  IconMoon,
  IconSearch,
  IconShare,
  IconSun,
  IconTurn,
} from "../components/Icons";
import { Stars } from "../components/Stars";
import { PlacePhoto } from "../components/PlacePhoto";
import { loadPlaces } from "../lib/data";
import { asset } from "../lib/assets";
import { validCoords } from "../lib/geo";
import { addDarkTiles, lightTiles } from "../lib/osm";
import { osrmDrive } from "../lib/osrm";
import { photosFor } from "../lib/photos";
import { TYPE_CHIP, TYPE_LABEL } from "../lib/categories";
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

export function MapPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const osmRef = useRef<L.TileLayer | null>(null);
  const lightRef = useRef<L.TileLayer | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
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
      marker.on("click", () => setPicked(p));
      cluster.addLayer(marker);
    });
  }, [filtered, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const via = parsePts(params.get("via"));
    const to = parsePts(params.get("to"));

    async function draw(pts: { lat: number; lon: number }[]) {
      if (lineRef.current) {
        lineRef.current.remove();
        lineRef.current = null;
      }
      if (!pts.length) return;
      let linePts = pts;
      if (pts.length === 1) {
        const dest = pts[0];
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              linePts = [{ lat: pos.coords.latitude, lon: pos.coords.longitude }, dest];
              resolve();
            },
            () => resolve(),
            { timeout: 4000 },
          );
        });
      }
      const latlngs = await osrmDrive(linePts);
      const line = L.polyline(latlngs, { color: "#3d8aff", weight: 5, opacity: 0.9 }).addTo(map);
      lineRef.current = line;
      map.fitBounds(line.getBounds(), { padding: [40, 40] });
    }

    if (via.length >= 2) draw(via);
    else if (to.length) draw(to);
  }, [params, ready]);

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
    nav(`/map?to=${picked.lat},${picked.lon}`, { replace: true });
    setPicked(null);
  }

  const photos = picked ? photosFor(picked).slice(0, 2) : [];
  const site = picked?.website || (picked ? `https://www.google.com/maps/search/?api=1&query=${picked.lat},${picked.lon}` : "");

  return (
    <div className="page map-page">
      <div className="map-wrap full" ref={mapEl} />
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
      <div className="map-tools">
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
        <button className="map-round" onClick={() => setLight((v) => !v)} aria-label="map theme">
          {light ? <IconMoon /> : <IconSun />}
        </button>
        <button className="map-round" onClick={() => mapRef.current?.zoomIn()}>
          +
        </button>
        <button className="map-round" onClick={() => mapRef.current?.zoomOut()}>
          −
        </button>
        <button className="map-round" onClick={locate} aria-label="My location">
          <IconLocate />
        </button>
      </div>
      {picked && (
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

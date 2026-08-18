import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { IconBack, IconFilter, IconInfo, IconLocate, IconSearch, IconSun } from "../components/Icons";
import { loadPlaces } from "../lib/data";
import { asset } from "../lib/assets";
import { googleRouteUrl, validCoords } from "../lib/geo";
import { addDarkTiles, satTiles } from "../lib/osm";
import { TYPE_LABEL } from "../lib/categories";
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
    html: `<span class="wb-pin-wrap ${tone}"><img src="${src}" alt="" width="22" height="22"/></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export function MapPage() {
  const nav = useNavigate();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const osmRef = useRef<L.TileLayer | null>(null);
  const satRef = useRef<L.TileLayer | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [q, setQ] = useState("");
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(TYPES.map((t) => [t, true])),
  );
  const [filters, setFilters] = useState(false);
  const [info, setInfo] = useState(false);
  const [sat, setSat] = useState(false);
  const [picked, setPicked] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return places.filter((p) => {
      if (!validCoords(p.lat, p.lon)) return false;
      if (!p.types.some((t) => on[t])) return false;
      if (s && !`${p.name} ${p.city} ${p.country}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [places, q, on]);

  useEffect(() => {
    loadPlaces().then(setPlaces);
  }, []);

  useEffect(() => {
    if (!mapEl.current) return;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false }).setView([45.1, 16.5], 5);
    const osm = addDarkTiles(map, osmRef);
    const hybrid = satTiles();
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    osmRef.current = osm;
    satRef.current = hybrid;
    setReady(true);
    const t = window.setTimeout(() => map.invalidateSize(), 120);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const osm = osmRef.current;
    const hybrid = satRef.current;
    if (!map || !osm || !hybrid || !ready) return;
    if (sat) {
      if (map.hasLayer(osm)) map.removeLayer(osm);
      if (!map.hasLayer(hybrid)) hybrid.addTo(map);
    } else {
      if (map.hasLayer(hybrid)) map.removeLayer(hybrid);
      if (!map.hasLayer(osm)) osm.addTo(map);
    }
  }, [sat, ready]);

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

  function locate() {
    navigator.geolocation?.getCurrentPosition((pos) => {
      mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 11);
    });
  }

  return (
    <div className="page map-page">
      <div className="map-wrap full" ref={mapEl} />
      <div className="map-search">
        <button className="map-round" onClick={() => nav(-1)} aria-label="Back">
          <IconBack />
        </button>
        <label className="map-q">
          <IconSearch />
          <input
            placeholder="Search the map"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button className="map-round" onClick={() => setInfo(true)} aria-label="About map">
          <IconInfo />
        </button>
      </div>
      <div className="map-tools">
        <button className="map-round" onClick={() => setFilters(true)} aria-label="filters">
          <IconFilter />
        </button>
        <button className="map-round" onClick={() => setSat((v) => !v)} aria-label="satellite">
          <IconSun />
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
        <div className="sheet" style={{ paddingBottom: 90 }}>
          <b>{picked.name}</b>
          <p className="muted">
            {TYPE_LABEL[picked.types[0]]} · {picked.city}, {picked.country}
          </p>
          <div className="row-btns">
            <button className="btn blue" onClick={() => nav(`/object/${picked.id}`)}>
              Open
            </button>
            <a className="btn ghost" href={googleRouteUrl(picked.lat, picked.lon)} target="_blank" rel="noreferrer">
              Route
            </a>
          </div>
          <button className="btn ghost" onClick={() => setPicked(null)}>
            Close
          </button>
        </div>
      )}
      {filters && (
        <>
          <div className="backdrop" onClick={() => setFilters(false)} />
          <div className="sheet">
            <h3>Map layers</h3>
            {TYPES.map((t) => (
              <label key={t} style={{ display: "flex", gap: 8, padding: 6 }}>
                <input
                  type="checkbox"
                  checked={!!on[t]}
                  onChange={(e) => setOn((prev) => ({ ...prev, [t]: e.target.checked }))}
                />
                {TYPE_LABEL[t]}
              </label>
            ))}
            <button className="btn blue" onClick={() => setFilters(false)}>
              Done
            </button>
          </div>
        </>
      )}
      {info && (
        <>
          <div className="backdrop" onClick={() => setInfo(false)} />
          <div className="sheet">
            <h3>Map</h3>
            <p className="muted">
              Google Maps does not allow this GitHub Pages site to use their key, so the map runs on OpenStreetMap.
              Route still opens Google / Apple / Waze in a new tab.
            </p>
            <button className="btn blue" onClick={() => setInfo(false)}>
              OK
            </button>
          </div>
        </>
      )}
    </div>
  );
}

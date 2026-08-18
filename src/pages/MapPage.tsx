import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { IconFilter } from "../components/Icons";
import { loadPlaces } from "../lib/data";
import { googleRouteUrl, validCoords } from "../lib/geo";
import { TYPE_COLOR, TYPE_LABEL } from "../lib/categories";
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

const PIN: Record<PlaceType, string> = {
  hotels: "#4da3ff",
  shops: "#e10600",
  bars: "#ffb020",
  restaurants: "#ff7a45",
  services: "#e10600",
  rent: "#8b6cff",
  festivals: "#e10600",
  viewpoints: "#3ddc84",
  historical: "#d4a017",
};

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
    const osm = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap, Carto",
    });
    const hybrid = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri" },
    );
    osm.addTo(map);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    osmRef.current = osm;
    satRef.current = hybrid;
    setReady(true);
    return () => {
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
      const color = PIN[p.types[0]] ?? TYPE_COLOR[p.types[0]] ?? "#e10600";
      const marker = L.marker([p.lat, p.lon], {
        title: p.name,
        icon: L.divIcon({
          className: "wb-pin",
          html: `<span style="background:${color};width:14px;height:14px;border-radius:50%;display:block;border:2px solid #fff;box-shadow:0 0 0 1px #0003"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
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
        <input
          placeholder="Search the map"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="icon-btn" onClick={() => setFilters(true)} aria-label="Filters">
          <IconFilter />
        </button>
      </div>
      <div className="map-tools">
        <button onClick={() => setFilters(true)} aria-label="filters">
          <IconFilter />
        </button>
        <button onClick={() => setSat((v) => !v)}>{sat ? "Map" : "Sat"}</button>
        <button onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button onClick={() => mapRef.current?.zoomOut()}>−</button>
        <button onClick={locate}>◎</button>
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
    </div>
  );
}

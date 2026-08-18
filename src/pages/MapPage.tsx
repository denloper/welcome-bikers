import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { IconFilter } from "../components/Icons";
import { loadPlaces } from "../lib/data";
import { loadGoogleMaps, waitGoogleAuth } from "../lib/googleMaps";
import { googleRouteUrl, validCoords } from "../lib/geo";
import { TYPE_COLOR } from "../lib/categories";
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

export function MapPage() {
  const nav = useNavigate();
  const mapEl = useRef<HTMLDivElement>(null);
  const searchEl = useRef<HTMLInputElement>(null);
  const gmapRef = useRef<google.maps.Map | null>(null);
  const clusterRef = useRef<MarkerClusterer | null>(null);
  const lmapRef = useRef<L.Map | null>(null);
  const lclusterRef = useRef<L.MarkerClusterGroup | null>(null);
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
  const [engine, setEngine] = useState<"google" | "osm" | "">("");

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
    let cancelled = false;

    function startOsm() {
      if (cancelled || !mapEl.current) return;
      mapEl.current.innerHTML = "";
      const map = L.map(mapEl.current, { zoomControl: false }).setView([45.1, 16.5], 5);
      const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      });
      const hybrid = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri" },
      );
      osm.addTo(map);
      const cluster = L.markerClusterGroup();
      map.addLayer(cluster);
      lmapRef.current = map;
      lclusterRef.current = cluster;
      osmRef.current = osm;
      satRef.current = hybrid;
      setEngine("osm");
      setReady(true);
    }

    loadGoogleMaps()
      .then(async () => {
        if (cancelled || !mapEl.current) return;
        const map = new google.maps.Map(mapEl.current, {
          center: { lat: 45.1, lng: 16.5 },
          zoom: 5,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: "#0b1220",
        });
        try {
          await waitGoogleAuth();
        } catch {
          startOsm();
          return;
        }
        if (cancelled) return;
        gmapRef.current = map;
        clusterRef.current = new MarkerClusterer({ map, markers: [] });
        if (searchEl.current) {
          const box = new google.maps.places.Autocomplete(searchEl.current, {
            fields: ["geometry", "name"],
          });
          box.addListener("place_changed", () => {
            const place = box.getPlace();
            const loc = place.geometry?.location;
            if (loc) map.panTo(loc);
            map.setZoom(12);
          });
        }
        setEngine("google");
        setReady(true);
      })
      .catch(() => startOsm());

    return () => {
      cancelled = true;
      clusterRef.current?.clearMarkers();
      clusterRef.current = null;
      gmapRef.current = null;
      lmapRef.current?.remove();
      lmapRef.current = null;
      lclusterRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (engine === "google") {
      gmapRef.current?.setMapTypeId(sat ? "hybrid" : "roadmap");
      return;
    }
    const map = lmapRef.current;
    const osm = osmRef.current;
    const hybrid = satRef.current;
    if (!map || !osm || !hybrid) return;
    if (sat) {
      map.removeLayer(osm);
      if (!map.hasLayer(hybrid)) hybrid.addTo(map);
    } else {
      map.removeLayer(hybrid);
      if (!map.hasLayer(osm)) osm.addTo(map);
    }
  }, [sat, ready, engine]);

  useEffect(() => {
    if (!ready) return;
    if (engine === "google") {
      const map = gmapRef.current;
      const cluster = clusterRef.current;
      if (!map || !cluster) return;
      cluster.clearMarkers();
      const markers = filtered.map((p) => {
        const type = p.types[0];
        const marker = new google.maps.Marker({
          position: { lat: p.lat, lng: p.lon },
          title: p.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: TYPE_COLOR[type] ?? "#c1121f",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 8,
          },
        });
        marker.addListener("click", () => setPicked(p));
        return marker;
      });
      cluster.addMarkers(markers);
      return;
    }
    const cluster = lclusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    filtered.forEach((p) => {
      const color = TYPE_COLOR[p.types[0]] ?? "#c1121f";
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
  }, [filtered, ready, engine]);

  function locate() {
    navigator.geolocation?.getCurrentPosition((pos) => {
      const center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      gmapRef.current?.panTo(center);
      gmapRef.current?.setZoom(11);
      lmapRef.current?.setView([center.lat, center.lng], 11);
    });
  }

  function zoom(delta: number) {
    if (gmapRef.current) {
      gmapRef.current.setZoom((gmapRef.current.getZoom() ?? 5) + delta);
      return;
    }
    lmapRef.current?.setZoom((lmapRef.current.getZoom() ?? 5) + delta);
  }

  return (
    <div className="page" style={{ position: "relative" }}>
      <div className="search-row">
        <input
          ref={searchEl}
          placeholder="Search the map"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="icon-btn" onClick={() => setFilters(true)} aria-label="Filters">
          <IconFilter />
        </button>
      </div>
      <div className={`map-wrap ${ready ? "" : "is-booting"}`} ref={mapEl} />
      <div className="map-tools">
        <button onClick={() => setFilters(true)} aria-label="filters">
          <IconFilter />
        </button>
        <button onClick={() => setSat((v) => !v)}>{sat ? "Map" : "Sat"}</button>
        <button onClick={() => zoom(1)}>+</button>
        <button onClick={() => zoom(-1)}>−</button>
        <button onClick={locate}>◎</button>
      </div>
      {picked && (
        <div className="sheet" style={{ paddingBottom: 90 }}>
          <b>{picked.name}</b>
          <p className="muted">
            {picked.city}, {picked.country}
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
                {t}
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

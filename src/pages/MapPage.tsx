import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { IconFilter } from "../components/Icons";
import { loadPlaces } from "../lib/data";
import { loadGoogleMaps } from "../lib/googleMaps";
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
  const mapRef = useRef<google.maps.Map | null>(null);
  const clusterRef = useRef<MarkerClusterer | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [q, setQ] = useState("");
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(TYPES.map((t) => [t, true])),
  );
  const [filters, setFilters] = useState(false);
  const [sat, setSat] = useState(false);
  const [picked, setPicked] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

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
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapEl.current) return;
        const map = new google.maps.Map(mapEl.current, {
          center: { lat: 45.1, lng: 16.5 },
          zoom: 5,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: "#0b1220",
        });
        mapRef.current = map;
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
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      clusterRef.current?.clearMarkers();
      clusterRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setMapTypeId(sat ? "hybrid" : "roadmap");
  }, [sat, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster || !ready) return;
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
  }, [filtered, ready]);

  function locate() {
    navigator.geolocation?.getCurrentPosition((pos) => {
      const center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mapRef.current?.panTo(center);
      mapRef.current?.setZoom(11);
    });
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
      {error && <div className="notice">{error}</div>}
      <div className="map-wrap" ref={mapEl} />
      <div className="map-tools">
        <button onClick={() => setFilters(true)} aria-label="filters">
          <IconFilter />
        </button>
        <button onClick={() => setSat((v) => !v)}>{sat ? "Map" : "Sat"}</button>
        <button onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 5) + 1)}>+</button>
        <button onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 5) - 1)}>−</button>
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

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { lightTiles } from "../lib/osm";

export function PlaceMiniMap({ lat, lon }: { lat: number; lon: number }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: true,
    }).setView([lat, lon], 15);
    lightTiles().addTo(map);
    L.circleMarker([lat, lon], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: "#e10600",
      fillOpacity: 1,
    }).addTo(map);
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(timer);
      map.remove();
    };
  }, [lat, lon]);

  return <div ref={el} className="mini-map" />;
}

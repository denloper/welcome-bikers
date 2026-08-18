import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export function GoogleMiniMap({ lat, lon }: { lat: number; lon: number }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
    }).setView([lat, lon], 15);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png").addTo(map);
    L.circleMarker([lat, lon], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: "#e10600",
      fillOpacity: 1,
    }).addTo(map);
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(t);
      map.remove();
    };
  }, [lat, lon]);

  return <div ref={el} className="mini-map" />;
}

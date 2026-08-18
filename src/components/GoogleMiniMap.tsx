import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { loadGoogleMaps, waitGoogleAuth } from "../lib/googleMaps";

export function GoogleMiniMap({ lat, lon }: { lat: number; lon: number }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let leaflet: L.Map | null = null;

    function osm() {
      if (cancelled || !el.current) return;
      el.current.innerHTML = "";
      leaflet = L.map(el.current, { zoomControl: false, attributionControl: false }).setView([lat, lon], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(leaflet);
      L.circleMarker([lat, lon], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#c1121f",
        fillOpacity: 1,
      }).addTo(leaflet);
    }

    loadGoogleMaps()
      .then(async () => {
        if (cancelled || !el.current) return;
        const map = new google.maps.Map(el.current, {
          center: { lat, lng: lon },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });
        new google.maps.Marker({ map, position: { lat, lng: lon } });
        await waitGoogleAuth();
      })
      .catch(() => osm());

    return () => {
      cancelled = true;
      leaflet?.remove();
    };
  }, [lat, lon]);

  return <div ref={el} className="mini-map" />;
}

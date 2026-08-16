import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "../lib/googleMaps";

export function GoogleMiniMap({ lat, lon }: { lat: number; lon: number }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !el.current) return;
      const map = new google.maps.Map(el.current, {
        center: { lat, lng: lon },
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
      });
      new google.maps.Marker({ map, position: { lat, lng: lon } });
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return <div ref={el} className="mini-map" />;
}

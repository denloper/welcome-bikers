import { useEffect, useState } from "react";
import { FALLBACK_PHOTO } from "../lib/photos";

export function PlacePhoto({ src, alt }: { src: string; alt: string }) {
  const [cur, setCur] = useState(src);

  useEffect(() => {
    setCur(src);
  }, [src]);

  return (
    <img
      src={cur}
      alt={alt}
      onError={() => {
        if (cur !== FALLBACK_PHOTO) setCur(FALLBACK_PHOTO);
      }}
    />
  );
}

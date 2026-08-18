import { useRef, useState } from "react";
import { PlacePhoto } from "./PlacePhoto";

export function PhotoCarousel({
  photos,
  alt,
  className,
}: {
  photos: string[];
  alt: string;
  className?: string;
}) {
  const list = photos.length ? photos : [""];
  const [i, setI] = useState(0);
  const start = useRef(0);

  function go(n: number) {
    setI((cur) => (cur + n + list.length) % list.length);
  }

  return (
    <div
      className={`carousel ${className ?? ""}`}
      onTouchStart={(e) => {
        start.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - start.current;
        if (dx > 40) go(-1);
        if (dx < -40) go(1);
      }}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (e.clientX - rect.left > rect.width / 2) go(1);
        else go(-1);
      }}
    >
      <PlacePhoto src={list[i]} alt={alt} />
      {list.length > 1 && (
        <div className="dots">
          {list.map((_, n) => (
            <i key={n} className={n === i ? "on" : ""} />
          ))}
        </div>
      )}
    </div>
  );
}

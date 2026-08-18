import { Link } from "react-router-dom";
import type { Place } from "../types";
import { photosFor } from "../lib/photos";
import { fullAddress } from "../lib/hours";
import { PhotoCarousel } from "./PhotoCarousel";
import { HoursToggle } from "./HoursToggle";
import { Stars } from "./Stars";
import { AmenityIcon, IconGlobe, IconPinStar } from "./Icons";

export function ObjectCard({
  place,
  distanceKm,
}: {
  place: Place;
  distanceKm?: number;
}) {
  const photos = photosFor(place);
  const tags = [
    ...(place.bikersFriendly ? ["Bikers friendly"] : []),
    ...(place.amenities ?? [])
      .map((a) => (a === "Motorcycle Parking" ? "Moto Parking" : a))
      .filter((a) => a !== "Bikers friendly"),
  ].slice(0, 2);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(place) || place.name)}`;

  return (
    <article className="card">
      <PhotoCarousel photos={photos} alt={place.name} className="card-photo" />
      <div className="card-body">
        <div className="addr-line">
          <span>{fullAddress(place)}</span>
          <a className="addr-globe" href={place.website || maps} target="_blank" rel="noreferrer" aria-label="Open map">
            <IconGlobe />
          </a>
        </div>
        <div className="place-name">{place.name}</div>
        <HoursToggle hours={place.openingHours} />
        <div style={{ margin: "8px 0" }}>
          <Stars value={place.rating} />
        </div>
        <div className="badges">
          {tags.map((t) => (
            <i key={t}>
              {t === "Bikers friendly" ? <IconPinStar /> : <AmenityIcon name={t} />}
              {t}
            </i>
          ))}
          {distanceKm != null && distanceKm < 500 && <i>{Math.round(distanceKm)} km</i>}
        </div>
        <Link className="btn blue" to={`/object/${place.id}`}>
          More details
        </Link>
      </div>
    </article>
  );
}

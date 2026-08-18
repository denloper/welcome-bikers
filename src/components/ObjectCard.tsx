import { Link } from "react-router-dom";
import type { Place } from "../types";
import { photosFor } from "../lib/photos";
import { PlacePhoto } from "./PlacePhoto";
import { Stars } from "./Stars";
import { AmenityIcon, IconGlobe, IconPin } from "./Icons";

export function ObjectCard({
  place,
  distanceKm,
}: {
  place: Place;
  distanceKm?: number;
}) {
  const photo = photosFor(place)[0];
  const tags = [
    ...(place.bikersFriendly ? ["Bikers friendly"] : []),
    ...(place.amenities ?? []).filter((a) => a !== "Bikers friendly"),
  ].slice(0, 2);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address || place.name)}`;

  return (
    <article className="card">
      <div className="card-photo">
        <PlacePhoto src={photo} alt={place.name} />
      </div>
      <div className="card-body">
        <div className="addr-line">
          <span>{place.address}</span>
          <a className="addr-globe" href={place.website || maps} target="_blank" rel="noreferrer" aria-label="Open map">
            <IconGlobe />
          </a>
        </div>
        <div className="place-name">{place.name}</div>
        <div style={{ margin: "6px 0 8px" }}>
          <Stars value={place.rating} />
        </div>
        <div className="badges">
          {tags.map((t) => (
            <i key={t}>
              {t === "Bikers friendly" ? <IconPin /> : <AmenityIcon name={t} />}
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

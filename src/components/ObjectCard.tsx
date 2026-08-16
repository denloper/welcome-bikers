import { Link } from "react-router-dom";
import type { Place } from "../types";
import { photosFor } from "../lib/photos";
import { formatDistance } from "../lib/geo";
import { PlacePhoto } from "./PlacePhoto";
import { Stars } from "./Stars";
import { IconPin } from "./Icons";

export function ObjectCard({
  place,
  distanceKm,
}: {
  place: Place;
  distanceKm?: number;
}) {
  const photo = photosFor(place)[0];
  return (
    <article className="card">
      <div className="card-photo">
        <PlacePhoto src={photo} alt={place.name} />
      </div>
      <div className="card-body">
        <div className="addr">
          <IconPin className="" />
          <span>{place.address}</span>
        </div>
        <div className="place-name">{place.name}</div>
        <div className="open">{place.openingHours === "24/7" ? "Open now • 24/7" : "Hours on request"}</div>
        <div style={{ margin: "6px 0 8px" }}>
          <Stars value={place.rating} />
        </div>
        <div className="badges">
          {place.bikersFriendly && <i>Bikers friendly</i>}
          {place.types.includes("hotels") && <i>Moto Parking</i>}
          {distanceKm != null && <i>{formatDistance(distanceKm)}</i>}
        </div>
        <Link className="btn blue" to={`/object/${place.id}`}>
          More details
        </Link>
      </div>
    </article>
  );
}

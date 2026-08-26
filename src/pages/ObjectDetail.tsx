import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { Stars } from "../components/Stars";
import { AmenityIcon, IconCal, IconGlobe, IconPencil, IconPhone, IconPin, IconShare } from "../components/Icons";
import { PlaceMiniMap } from "../components/PlaceMiniMap";
import { PhotoCarousel } from "../components/PhotoCarousel";
import { HoursToggle } from "../components/HoursToggle";
import { getPlace, loadPlaces } from "../lib/data";
import { dateFromToday, validDateRange } from "../lib/dates";
import { photosFor } from "../lib/photos";
import { appleMapsUrl, googleRouteUrl, validCoords, wazeUrl } from "../lib/geo";
import { fullAddress } from "../lib/hours";
import { TYPE_LABEL } from "../lib/categories";
import { store } from "../lib/store";
import type { Place } from "../types";

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).replace(" ", ", ");
}

export function ObjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [place, setPlace] = useState<Place | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [fav, setFav] = useState(false);
  const [report, setReport] = useState(false);
  const [from, setFrom] = useState(() => dateFromToday(1));
  const [to, setTo] = useState(() => dateFromToday(2));
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    loadPlaces().then((all) => {
      const p = getPlace(all, id);
      setPlace(p ?? null);
      setFav(!!id && store.get().favorites.includes(id));
    });
  }, [id]);

  if (!place) return <div className="empty">Loading…</div>;
  const photos = photosFor(place);
  const canRoute = validCoords(place.lat, place.lon);
  const hotel = place.types.includes("hotels");
  const datesValid = validDateRange(from, to);
  const maps = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;

  function share() {
    const text = `${place!.name} — ${fullAddress(place!)}\n${place!.lat},${place!.lon}`;
    if (navigator.share) navigator.share({ title: place!.name, text, url: location.href });
    else navigator.clipboard.writeText(`${text}\n${location.href}`);
  }

  function requestBook() {
    if (!datesValid) return;
    const user = store.get().user;
    if (!user) {
      nav("/login");
      return;
    }
    store.addBooking({
      id: crypto.randomUUID(),
      placeId: place!.id,
      placeName: place!.name,
      from,
      to,
      createdAt: Date.now(),
      status: "requested",
    });
    setBooked(true);
  }

  return (
    <div className="page">
      <TopBar title={TYPE_LABEL[place.types[0]]} />
      <PhotoCarousel photos={photos} alt={place.name} className="hero" />
      <div className="section">
        <div className="title-row">
          <div className="place-name">{place.name}</div>
          <button className="icon-btn" onClick={share} aria-label="Share">
            <IconShare />
          </button>
        </div>
        <HoursToggle hours={place.openingHours} />
        <div className="rate-row">
          <Stars value={place.rating} />
          <a className="addr-globe" href={maps} target="_blank" rel="noreferrer" aria-label="Map">
            <IconGlobe />
          </a>
        </div>
        <Link className="reviews-link" to={`/object/${place.id}/reviews`}>
          View All Reviews
        </Link>
        <Link className="btn white review-btn" to={`/object/${place.id}/reviews`}>
          <IconPencil />
          Write a review
        </Link>

        <h3>Information</h3>
        {place.slogan && <p style={{ fontStyle: "italic" }}>«{place.slogan}»</p>}
        {place.description && <p className="muted">{place.description}</p>}
        <p className="addr">
          <IconPin />
          <span>{fullAddress(place)}</span>
        </p>

        {(place.amenities?.length ?? 0) > 0 && (
          <>
            <h3>Services provided</h3>
            {place.amenities!.map((a) => (
              <div className="amenity" key={a}>
                <AmenityIcon name={a} />
                <span>{a === "Food & Beverages 24/7" ? "Food 24/7" : a === "Motorcycle Parking" ? "Moto Parking" : a}</span>
              </div>
            ))}
          </>
        )}

        {place.phone && (
          <a className="contact-row" href={`tel:${place.phone}`}>
            <IconPhone />
            <span>{place.phone}</span>
          </a>
        )}
        {place.website && (
          <a className="contact-row" href={place.website} target="_blank" rel="noreferrer">
            <IconGlobe />
            <span>{place.website.replace(/^https?:\/\//, "")}</span>
          </a>
        )}

        {hotel && (
          <>
            <label className="date-pill">
              <IconCal />
              <input type="date" min={dateFromToday()} value={from} onChange={(e) => setFrom(e.target.value)} />
              <span>→</span>
              <input type="date" min={from || dateFromToday()} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <p className="muted date-hint">
              {fmtDate(from)} → {fmtDate(to)}
            </p>
            {booked ? (
              <div className="notice" style={{ margin: "0 0 16px" }}>
                Saved on this device. No request was sent to the hotel.
              </div>
            ) : (
              <button className="btn green" disabled={!datesValid} onClick={requestBook} style={{ marginBottom: 14 }}>
                Save booking request
              </button>
            )}
            {!datesValid && <p className="muted">Choose a future check-in and a later check-out date.</p>}
            <Link className="link" to={`/object/${place.id}/book`}>
              Choose a room
            </Link>
          </>
        )}

        <div className="row-btns" style={{ marginTop: 16 }}>
          <button className="btn blue" disabled={!canRoute} onClick={() => setNavOpen(true)}>
            Build route
          </button>
        </div>
        <div className="row-btns">
          <button
            className="btn ghost small"
            onClick={() => setFav(store.toggleFavorite(place.id).includes(place.id))}
          >
            {fav ? "Saved" : "Save"}
          </button>
          <button className="btn ghost small" onClick={() => setReport(true)}>
            Report
          </button>
        </div>
        <PlaceMiniMap lat={place.lat} lon={place.lon} />
      </div>

      {navOpen && (
        <>
          <div className="backdrop" onClick={() => setNavOpen(false)} />
          <div className="sheet">
            <h3>Open navigation</h3>
            <button
              className="btn green"
              disabled={!canRoute}
              onClick={() => nav(`/map?to=${place.lat},${place.lon}&name=${encodeURIComponent(place.name)}&type=${place.types[0]}`)}
            >
              In the app
            </button>
            <div style={{ height: 8 }} />
            <a className="btn blue" href={googleRouteUrl(place.lat, place.lon)} target="_blank" rel="noreferrer">
              Google Maps
            </a>
            <div style={{ height: 8 }} />
            <a className="btn ghost" href={appleMapsUrl(place.lat, place.lon)} target="_blank" rel="noreferrer">
              Apple Maps
            </a>
            <div style={{ height: 8 }} />
            <a className="btn ghost" href={wazeUrl(place.lat, place.lon)} target="_blank" rel="noreferrer">
              Waze
            </a>
          </div>
        </>
      )}
      {report && (
        <>
          <div className="backdrop" onClick={() => setReport(false)} />
          <div className="sheet">
            <h3>Report a problem</h3>
            <p className="muted">Tell us if the pin, hours or details are wrong.</p>
            <textarea placeholder="What is wrong?" />
            <button
              className="btn blue"
              onClick={() => {
                setReport(false);
                nav(-1);
              }}
            >
              Send report
            </button>
          </div>
        </>
      )}
    </div>
  );
}

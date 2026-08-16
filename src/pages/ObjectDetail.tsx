import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { Stars } from "../components/Stars";
import { IconShare } from "../components/Icons";
import { GoogleMiniMap } from "../components/GoogleMiniMap";
import { getPlace, loadPlaces } from "../lib/data";
import { photosFor } from "../lib/photos";
import { appleMapsUrl, googleRouteUrl, validCoords, wazeUrl } from "../lib/geo";
import { store } from "../lib/store";
import type { Place } from "../types";

export function ObjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [place, setPlace] = useState<Place | null>(null);
  const [slide, setSlide] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [fav, setFav] = useState(false);
  const [report, setReport] = useState(false);

  useEffect(() => {
    const n = Number(id);
    loadPlaces().then((all) => {
      const p = getPlace(all, n);
      setPlace(p ?? null);
      setFav(store.get().favorites.includes(n));
    });
  }, [id]);

  if (!place) return <div className="empty">Loading…</div>;
  const photos = photosFor(place);
  const canRoute = validCoords(place.lat, place.lon);

  function share() {
    const text = `${place!.name} — ${place!.address}\n${place!.lat},${place!.lon}`;
    if (navigator.share) navigator.share({ title: place!.name, text, url: location.href });
    else navigator.clipboard.writeText(`${text}\n${location.href}`);
  }

  return (
    <div className="page">
      <TopBar
        title={place.types.includes("hotels") ? "Hotel" : place.types[0]}
        right={
          <button className="icon-btn" onClick={share} aria-label="Share">
            <IconShare />
          </button>
        }
      />
      <div className="hero">
        <img src={photos[slide % photos.length]} alt={place.name} />
        <div className="dots">
          {photos.map((_, i) => (
            <i key={i} className={i === slide % photos.length ? "on" : ""} onClick={() => setSlide(i)} />
          ))}
        </div>
      </div>
      <div className="section">
        <div className="place-name">{place.name}</div>
        <div className="open">{place.openingHours === "24/7" ? "Open now · 24/7" : "Hours on request"}</div>
        <div style={{ margin: "8px 0" }}>
          <Stars value={place.rating} />
        </div>
        <Link className="link" to={`/object/${place.id}/reviews`}>
          View All Reviews
        </Link>
        <div className="row-btns">
          <Link className="btn white" to={`/object/${place.id}/reviews`}>
            Write a review
          </Link>
        </div>
        <h3>Information</h3>
        {place.slogan && <p style={{ fontStyle: "italic" }}>«{place.slogan}»</p>}
        <p className="muted">{place.description}</p>
        <p className="addr">{place.address}</p>
        <p className="muted">
          {place.lat.toFixed(5)}, {place.lon.toFixed(5)}
        </p>
        <div className="badges">
          {place.bikersFriendly && <i>Bikers friendly</i>}
          {place.amenities?.slice(0, 3).map((a) => (
            <i key={a}>{a}</i>
          ))}
        </div>
        {place.types.includes("hotels") && (
          <Link className="btn blue" to={`/object/${place.id}/book`} style={{ marginBottom: 10 }}>
            Request booking
          </Link>
        )}
        <div className="row-btns">
          <button className="btn blue" disabled={!canRoute} onClick={() => setNavOpen(true)}>
            Build route
          </button>
        </div>
        <div className="row-btns">
          {place.phone && (
            <a className="btn ghost small" href={`tel:${place.phone}`}>
              Call
            </a>
          )}
          {place.website && (
            <a className="btn ghost small" href={place.website} target="_blank" rel="noreferrer">
              Website
            </a>
          )}
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
        <GoogleMiniMap lat={place.lat} lon={place.lon} />
      </div>

      {navOpen && (
        <>
          <div className="backdrop" onClick={() => setNavOpen(false)} />
          <div className="sheet">
            <h3>Open navigation</h3>
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

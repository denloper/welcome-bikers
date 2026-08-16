import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { getPlace, loadPlaces } from "../lib/data";
import { store } from "../lib/store";
import type { Place } from "../types";

export function HotelBook() {
  const { id } = useParams();
  const nav = useNavigate();
  const [place, setPlace] = useState<Place | null>(null);
  const [from, setFrom] = useState("2026-08-16");
  const [to, setTo] = useState("2026-08-17");
  const [done, setDone] = useState(false);

  useEffect(() => {
    loadPlaces().then((all) => setPlace(getPlace(all, Number(id)) ?? null));
  }, [id]);

  if (!place) return <div className="empty">Loading…</div>;

  return (
    <div className="page">
      <TopBar title="Hotel" />
      <div className="section">
        <h3>Services provided</h3>
        {(place.amenities ?? []).map((a) => (
          <div className="amenity" key={a}>
            {a}
          </div>
        ))}
        <button className="btn ghost small" style={{ margin: "8px 0 18px" }}>
          See all amenities
        </button>
        <h3>Select date</h3>
        <div className="date-field">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {done ? (
          <div className="notice">Booking request sent. The hotel will confirm in the app.</div>
        ) : (
          <button
            className="btn green"
            style={{ marginTop: 18 }}
            onClick={() => {
              const user = store.get().user;
              if (!user) {
                nav("/login");
                return;
              }
              store.addBooking({
                id: crypto.randomUUID(),
                placeId: place.id,
                placeName: place.name,
                from,
                to,
                createdAt: Date.now(),
                status: "requested",
              });
              setDone(true);
            }}
          >
            Request booking
          </button>
        )}
      </div>
    </div>
  );
}

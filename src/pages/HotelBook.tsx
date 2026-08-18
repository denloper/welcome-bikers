import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { PlacePhoto } from "../components/PlacePhoto";
import { getPlace, loadHotelRooms, loadPlaces } from "../lib/data";
import { store } from "../lib/store";
import type { HotelRoom, Place } from "../types";

export function HotelBook() {
  const { id } = useParams();
  const nav = useNavigate();
  const [place, setPlace] = useState<Place | null>(null);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [from, setFrom] = useState("2026-08-16");
  const [to, setTo] = useState("2026-08-17");
  const [done, setDone] = useState(false);

  useEffect(() => {
    loadPlaces().then((all) => setPlace(getPlace(all, id) ?? null));
    loadHotelRooms().then((all) => setRooms(all.filter((r) => r.hotelId === id)));
  }, [id]);

  const room = useMemo(() => rooms.find((r) => r.id === picked) ?? rooms[0], [rooms, picked]);

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
        {rooms.length > 0 && (
          <>
            <h3>Rooms</h3>
            <div className="filters">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className={`chip ${room?.id === r.id ? "on" : ""}`}
                  onClick={() => setPicked(r.id)}
                >
                  {r.name}
                </button>
              ))}
            </div>
            {room && (
              <div className="card" style={{ margin: "10px 0 18px" }}>
                {room.photos[0] && (
                  <div className="card-photo">
                    <PlacePhoto src={room.photos[0]} alt={room.name} />
                  </div>
                )}
                <div className="card-body">
                  <b>
                    {room.type} · {room.bed}
                  </b>
                  <p className="muted">
                    {room.guests} guests{room.square ? ` · ${room.square} m²` : ""}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
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

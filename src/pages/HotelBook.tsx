import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { PlacePhoto } from "../components/PlacePhoto";
import { AmenityIcon } from "../components/Icons";
import { getPlace, loadHotelRooms, loadPlaces } from "../lib/data";
import { dateFromToday, validDateRange } from "../lib/dates";
import { store } from "../lib/store";
import type { HotelRoom, Place } from "../types";

export function HotelBook() {
  const { id } = useParams();
  const nav = useNavigate();
  const [place, setPlace] = useState<Place | null>(null);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [from, setFrom] = useState(() => dateFromToday(1));
  const [to, setTo] = useState(() => dateFromToday(2));
  const [done, setDone] = useState(false);

  useEffect(() => {
    loadPlaces().then((all) => setPlace(getPlace(all, id) ?? null));
    loadHotelRooms().then((all) => setRooms(all.filter((r) => r.hotelId === id)));
  }, [id]);

  const room = useMemo(() => rooms.find((r) => r.id === picked) ?? rooms[0], [rooms, picked]);
  const datesValid = validDateRange(from, to);

  if (!place) return <div className="empty">Loading…</div>;

  return (
    <div className="page">
      <TopBar title="Hotel" />
      <div className="section">
            <h3>Services provided</h3>
        {(place.amenities ?? []).map((a) => (
          <div className="amenity" key={a}>
            <AmenityIcon name={a} />
            <span>{a}</span>
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
          <input type="date" min={dateFromToday()} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>→</span>
          <input type="date" min={from || dateFromToday()} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {!datesValid && <p className="muted">Choose a future check-in and a later check-out date.</p>}
        {done ? (
          <div className="notice">Saved on this device. No request was sent to the hotel.</div>
        ) : (
          <button
            className="btn green"
            style={{ marginTop: 18 }}
            disabled={!datesValid}
            onClick={() => {
              if (!datesValid) return;
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

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { Stars } from "../components/Stars";
import { getPlace, loadPlaces } from "../lib/data";
import { store } from "../lib/store";
import type { Place, Review } from "../types";

export function Reviews() {
  const { id } = useParams();
  const nav = useNavigate();
  const [place, setPlace] = useState<Place | null>(null);
  const [rows, setRows] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  useEffect(() => {
    const n = Number(id);
    loadPlaces().then((all) => setPlace(getPlace(all, n) ?? null));
    setRows(store.get().reviews.filter((r) => r.placeId === n));
  }, [id]);

  if (!place) return <div className="empty">Loading…</div>;

  return (
    <div className="page">
      <TopBar title="Reviews" />
      <div className="section">
        <div className="place-name">{place.name}</div>
        <Stars value={place.rating} count={place.reviews + rows.length} />
        <h3>Write a review</h3>
        <div className="filters">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={`chip ${rating === n ? "on" : ""}`} onClick={() => setRating(n)}>
              {n}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="How was the stop?" />
        <button
          className="btn blue"
          style={{ marginTop: 10 }}
          onClick={() => {
            const user = store.get().user;
            if (!user) {
              nav("/login");
              return;
            }
            if (!text.trim()) return;
            const review: Review = {
              id: crypto.randomUUID(),
              placeId: place.id,
              userId: user.id,
              name: user.name,
              rating,
              text: text.trim(),
              createdAt: Date.now(),
            };
            setRows(store.addReview(review).filter((r) => r.placeId === place.id));
            setText("");
          }}
        >
          Publish
        </button>
        <h3>All reviews</h3>
        {rows.length === 0 && <p className="muted">No rider reviews yet. Google score: {place.rating ?? "n/a"}.</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid #222" }}>
            <b>{r.name}</b> <Stars value={r.rating} />
            <p>{r.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

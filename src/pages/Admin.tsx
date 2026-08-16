import { useEffect, useState } from "react";
import { TopBar } from "../components/TopBar";
import { store } from "../lib/store";
import type { Place } from "../types";

export function Admin() {
  const [rows, setRows] = useState<Place[]>([]);

  useEffect(() => {
    setRows((store.get().pendingPlaces as Place[]) ?? []);
  }, []);

  return (
    <div className="page">
      <TopBar title="Moderation" />
      <div className="section">
        <p className="muted">{rows.length} places waiting.</p>
        {rows.map((p) => (
          <div key={p.id} className="card" style={{ padding: 14 }}>
            <b>{p.name}</b>
            <p className="muted">
              {p.types.join(", ")} · {p.city}, {p.country}
            </p>
            <p className="muted">
              {p.lat}, {p.lon}
            </p>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">Queue is empty.</div>}
      </div>
    </div>
  );
}

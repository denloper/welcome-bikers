import { useEffect, useState } from "react";
import { TopBar } from "../components/TopBar";
import { loadSos } from "../lib/data";
import { readLocation } from "../lib/location";
import { store } from "../lib/store";
import type { SosAlert } from "../types";

export function Help() {
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const [coords, setCoords] = useState("");
  const [alerts, setAlerts] = useState<SosAlert[]>([]);

  useEffect(() => {
    loadSos().then(setAlerts);
  }, []);

  function locate() {
    void readLocation().then((fix) => {
      if (!fix) {
        setCoords("location unavailable");
        return;
      }
      setCoords(`${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`);
    });
  }

  return (
    <div className="page">
      <TopBar title="Help on the route" />
      <div className="section">
        <p>Prepare an SOS note with your location. This preview stores it only on this device.</p>
        <button className="btn ghost" onClick={locate}>
          Attach my location
        </button>
        {coords && <p className="muted">Location: {coords}</p>}
        <textarea
          style={{ marginTop: 12 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Flat tire, need a workshop, fuel..."
        />
        {sent ? (
          <div className="notice">SOS note saved on this device. No external alert was sent.</div>
        ) : (
          <button
            className="btn blue"
            style={{ marginTop: 12 }}
            onClick={() => {
              const user = store.get().user;
              store.addMessage({
                id: crypto.randomUUID(),
                room: "sos",
                userId: user?.id ?? "guest",
                name: user?.name ?? "Rider",
                text: `SOS ${coords || "no pin"} — ${note || "Need help on the road"}`,
                createdAt: Date.now(),
              });
              setSent(true);
            }}
          >
            Save SOS note
          </button>
        )}
        {alerts.length > 0 && (
          <>
            <h3>Recent alerts</h3>
            {alerts.map((a) => (
              <div key={a.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
                <b>{a.type}</b>
                <p>{a.additional}</p>
                <p className="muted">{a.coords || "no pin"}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

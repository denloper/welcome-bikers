import { useState } from "react";
import { TopBar } from "../components/TopBar";
import { store } from "../lib/store";

export function Help() {
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const [coords, setCoords] = useState("");

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setCoords(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`),
      () => setCoords("location unavailable"),
    );
  }

  return (
    <div className="page">
      <TopBar title="Help on the route" />
      <div className="section">
        <p>One tap alerts nearby riders and roadside help. Share your pin and what happened.</p>
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
          <div className="notice">Help request posted to the riders chat.</div>
        ) : (
          <button
            className="btn blue"
            style={{ marginTop: 12 }}
            onClick={() => {
              const user = store.get().user;
              store.addMessage({
                id: crypto.randomUUID(),
                room: "general",
                userId: user?.id ?? "guest",
                name: user?.name ?? "Rider",
                text: `SOS ${coords || "no pin"} — ${note || "Need help on the road"}`,
                createdAt: Date.now(),
              });
              setSent(true);
            }}
          >
            Send SOS
          </button>
        )}
      </div>
    </div>
  );
}

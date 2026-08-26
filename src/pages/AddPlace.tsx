import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { PLACE_TYPES } from "../lib/categories";
import { invalidatePlaces } from "../lib/data";
import { readLocation } from "../lib/location";
import { store } from "../lib/store";
import type { Place, PlaceType } from "../types";

export function AddPlace() {
  const nav = useNavigate();
  const user = store.get().user;
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "bars" as PlaceType,
    country: "",
    city: "",
    address: "",
    zip: "",
    lat: "",
    lon: "",
    phone: "",
    website: "",
    email: "",
    description: "",
    bikersFriendly: true,
    agree: false,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function locate() {
    void readLocation().then((fix) => {
      if (!fix) return;
      set("lat", String(fix.lat.toFixed(6)));
      set("lon", String(fix.lon.toFixed(6)));
    });
  }

  if (!user) {
    return (
      <div className="page">
        <TopBar title="Add your place" />
        <div className="section">
          <p>Sign in to save a local place submission.</p>
          <button className="btn blue" onClick={() => nav("/login")}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page">
        <TopBar title="Add your place" />
        <div className="notice">Saved on this device. It has not been sent to a moderator.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <TopBar title="Add your place" />
      <form
        className="form form-spaced"
        onSubmit={(e) => {
          e.preventDefault();
          const lat = Number(form.lat);
          const lon = Number(form.lon);
          if (!form.name || !Number.isFinite(lat) || !Number.isFinite(lon) || !form.agree) return;
          const place: Place = {
            id: crypto.randomUUID(),
            name: form.name,
            types: [form.type],
            country: form.country,
            city: form.city,
            lat,
            lon,
            rating: null,
            reviews: 0,
            video: null,
            bikersFriendly: form.bikersFriendly,
            address: [form.address, form.zip].filter(Boolean).join(", ") || `${form.city}, ${form.country}`,
            description: form.description,
            phone: form.phone,
            website: form.website,
            email: form.email,
            status: "pending",
            createdBy: user.id,
          };
          store.addPending(place);
          invalidatePlaces();
          setDone(true);
        }}
      >
        <label className="lbl">Name *</label>
        <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        <label className="lbl">Category *</label>
        <select value={form.type} onChange={(e) => set("type", e.target.value as PlaceType)}>
          {PLACE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="lbl">Country</label>
        <input className="field" value={form.country} onChange={(e) => set("country", e.target.value)} />
        <label className="lbl">City</label>
        <input className="field" value={form.city} onChange={(e) => set("city", e.target.value)} />
        <label className="lbl">Address</label>
        <input className="field" value={form.address} onChange={(e) => set("address", e.target.value)} />
        <label className="lbl">Index / ZIP</label>
        <input className="field" value={form.zip} onChange={(e) => set("zip", e.target.value)} />
        <label className="lbl">Latitude / longitude *</label>
        <div className="row-btns">
          <input className="field" placeholder="lat" value={form.lat} onChange={(e) => set("lat", e.target.value)} required />
          <input className="field" placeholder="lon" value={form.lon} onChange={(e) => set("lon", e.target.value)} required />
        </div>
        <button type="button" className="btn ghost" onClick={locate}>
          Use my location
        </button>
        <label className="lbl">Phone</label>
        <input className="field" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <label className="lbl">Website</label>
        <input className="field" value={form.website} onChange={(e) => set("website", e.target.value)} />
        <label className="lbl">Email</label>
        <input className="field" value={form.email} onChange={(e) => set("email", e.target.value)} />
        <label className="lbl">Description</label>
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
        <label>
          <input
            type="checkbox"
            checked={form.bikersFriendly}
            onChange={(e) => set("bikersFriendly", e.target.checked)}
          />{" "}
          Bikers friendly
        </label>
        <label>
          <input type="checkbox" checked={form.agree} onChange={(e) => set("agree", e.target.checked)} required /> I
          agree with the rules
        </label>
        <button className="btn blue" type="submit">
          Save local submission
        </button>
      </form>
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { Login } from "./Auth";
import { store } from "../lib/store";

export function Account() {
  const nav = useNavigate();
  const user = store.get().user;

  if (!user) return <Login />;

  return (
    <div className="page">
      <TopBar
        title="Profile"
        right={
          <button className="icon-btn" onClick={() => nav("/account/edit")} aria-label="Edit">
            ✎
          </button>
        }
      />
      <div className="profile">
        <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
        <div className="place-name" style={{ fontSize: 32 }}>
          {user.name}
        </div>
        {!user.emailVerified && (
          <div className="verify">
            Get the most out of your account. Confirm your email to stay secure and never lose access.
            <div>
              <button
                className="link"
                onClick={() => {
                  store.setUser({ ...user, emailVerified: true });
                  nav(0);
                }}
              >
                Verify Your Email
              </button>
            </div>
          </div>
        )}
        <div className="menu-list">
          <Link to="/account/friends">Friends</Link>
          <Link to="/account/bookings">Booking history</Link>
          <a href="mailto:hello@welcomebikers.eu">Contact us</a>
          <Link to="/chat/test">Chat test</Link>
        </div>
        <button
          className="btn ghost"
          style={{ marginTop: 24 }}
          onClick={() => {
            store.setUser(null);
            nav("/");
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}

export function AccountEdit() {
  const nav = useNavigate();
  const user = store.get().user;
  const [name, setName] = useState(user?.name ?? "");

  if (!user) return null;

  return (
    <div className="page">
      <TopBar title="Edit profile" />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          store.setUser({ ...user, name });
          nav("/account");
        }}
      >
        <label className="lbl">Display name</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="lbl">Email</label>
        <input className="field" value={user.email} disabled />
        <button className="btn blue" type="submit">
          Save
        </button>
      </form>
    </div>
  );
}

export function Friends() {
  const user = store.get().user;
  return (
    <div className="page">
      <TopBar title="Friends" />
      <div className="section">
        {(user?.friends.length ?? 0) === 0 && <p className="muted">No friends yet. Meet riders in the chat.</p>}
      </div>
    </div>
  );
}

export function Bookings() {
  const rows = store.get().bookings;
  return (
    <div className="page">
      <TopBar title="Booking history" />
      {rows.length === 0 && <div className="empty">No bookings yet.</div>}
      {rows.map((b) => (
        <div key={b.id} className="card" style={{ padding: 14 }}>
          <b>{b.placeName}</b>
          <p className="muted">
            {b.from} → {b.to} · {b.status}
          </p>
        </div>
      ))}
    </div>
  );
}

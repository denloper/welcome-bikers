import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { store } from "../lib/store";

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="page">
      <header className="topbar">
        <div />
        <h1>Sign in</h1>
        <div />
      </header>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            store.login(email.trim(), password);
            nav("/account");
          } catch (ex) {
            setErr((ex as Error).message);
          }
        }}
      >
        <label className="lbl">Email *</label>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="lbl">Password *</label>
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p style={{ color: "#f66" }}>{err}</p>}
        <button className="btn blue" type="submit">
          Sign in
        </button>
        <Link className="btn ghost" to="/register">
          Create an account
        </Link>
      </form>
    </div>
  );
}

export function Register() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="page">
      <header className="topbar">
        <div />
        <h1>Sign up</h1>
        <div />
      </header>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            store.register(name.trim(), email.trim(), password);
            nav("/account");
          } catch (ex) {
            setErr((ex as Error).message);
          }
        }}
      >
        <label className="lbl">Name *</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
        <label className="lbl">Email *</label>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="lbl">Password *</label>
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p style={{ color: "#f66" }}>{err}</p>}
        <button className="btn blue" type="submit">
          Sign up
        </button>
        <p className="muted">By clicking, you agree to our Privacy Statement.</p>
      </form>
    </div>
  );
}

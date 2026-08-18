import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { IconBack, IconEye, IconGoogle, IconUser } from "../components/Icons";
import { store } from "../lib/store";

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [forgot, setForgot] = useState(false);

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Back">
          <IconBack />
        </button>
        <div className="topbar-mid">
          <h1>Registration</h1>
        </div>
        <Link className="icon-btn" to="/account" aria-label="Account">
          <IconUser />
        </Link>
      </header>
      <form
        className="form auth-form"
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
        <div className="pw-wrap">
          <input
            className="field"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="pw-eye" onClick={() => setShow((v) => !v)} aria-label="Show password">
            <IconEye />
          </button>
        </div>
        {err && <p style={{ color: "#f66" }}>{err}</p>}
        {forgot && <p className="muted">Reset link will be sent to this email when the mail server is connected.</p>}
        <button className="btn white" type="submit">
          Sign in
        </button>
        <button
          className="btn white google-btn"
          type="button"
          onClick={() => setErr("Google sign-in is not available in the web preview. Use email.")}
        >
          <IconGoogle />
          Sign in with Google
        </button>
        <Link className="btn ghost" to="/register">
          Create an account
        </Link>
        <button className="btn ghost" type="button" onClick={() => setForgot(true)}>
          Forgot password?
        </button>
      </form>
    </div>
  );
}

export function Register() {
  const nav = useNavigate();
  const [step, setStep] = useState<"start" | "form">("start");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  if (step === "start") {
    return (
      <div className="page splash">
        <header className="topbar">
          <button className="icon-btn" onClick={() => nav(-1)} aria-label="Back">
            <IconBack />
          </button>
          <div className="topbar-mid">
            <h1>Registration</h1>
          </div>
          <Link className="icon-btn" to="/account" aria-label="Account">
            <IconUser />
          </Link>
        </header>
        <div className="splash-body">
          <BrandLogo />
          <p className="splash-tag">
            FROM BIKERS
            <br />
            FOR BIKERS
            <span className="splash-pin" aria-hidden />
          </p>
          <button className="btn white" onClick={() => setStep("form")}>
            START
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setStep("start")} aria-label="Back">
          <IconBack />
        </button>
        <div className="topbar-mid">
          <h1>Registration</h1>
        </div>
        <div />
      </header>
      <form
        className="form auth-form"
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
        <button className="btn white" type="submit">
          Create an account
        </button>
        <p className="muted">By clicking, you agree to our Privacy Statement.</p>
      </form>
    </div>
  );
}

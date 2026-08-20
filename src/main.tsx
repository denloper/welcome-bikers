import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// Google Maps may rewrite location.hash. HashRouter needs "#/…" or the SPA leaves the map.
let lastHash = window.location.hash.startsWith("#/") ? window.location.hash : "#/";
window.addEventListener("hashchange", (ev) => {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) {
    lastHash = hash;
    return;
  }
  ev.stopImmediatePropagation();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${lastHash}`);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

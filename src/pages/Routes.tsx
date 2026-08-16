import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { IconShare } from "../components/Icons";
import { loadRoutes } from "../lib/data";
import { googleRouteUrl } from "../lib/geo";
import type { RideRoute } from "../types";

export function Routes() {
  const [rows, setRows] = useState<RideRoute[]>([]);
  useEffect(() => {
    loadRoutes().then(setRows);
  }, []);

  return (
    <div className="page">
      <TopBar title="Best Routes" />
      {rows.map((r) => (
        <article className="card" key={r.id}>
          <div className="card-photo">
            <img src={r.image} alt={r.title} />
          </div>
          <div className="card-body">
            <p className="muted">{r.subtitle}</p>
            <div className="place-name" style={{ fontSize: 24 }}>
              {r.title}
            </div>
            <Link className="btn blue" to={`/routes/${r.id}`}>
              More details
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function RouteDetail() {
  const { id } = useParams();
  const [route, setRoute] = useState<RideRoute | null>(null);
  useEffect(() => {
    loadRoutes().then((all) => setRoute(all.find((r) => r.id === id) ?? null));
  }, [id]);

  if (!route) return <div className="empty">Loading…</div>;
  const start = route.points[0];
  const end = route.points[route.points.length - 1];
  const gpx = buildGpx(route);

  function share() {
    const text = `${route!.title} — ${route!.subtitle}`;
    if (navigator.share) navigator.share({ title: route!.title, text });
    else navigator.clipboard.writeText(text);
  }

  return (
    <div className="page">
      <TopBar
        title="Route"
        right={
          <button className="icon-btn" onClick={share} aria-label="Share">
            <IconShare />
          </button>
        }
      />
      <div className="hero">
        <img src={route.image} alt="" />
      </div>
      <div className="section">
        <div className="place-name" style={{ fontSize: 26 }}>
          {route.title}
        </div>
        <p className="muted">{route.subtitle}</p>
        <h3>Information</h3>
        <ul>
          {route.days.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <div className="row-btns">
          <a className="btn blue" href={googleRouteUrl(end.lat, end.lon)} target="_blank" rel="noreferrer">
            Let's ride!
          </a>
          <a
            className="btn white small"
            href={URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }))}
            download={`${route.id}.gpx`}
          >
            GPX
          </a>
        </div>
        <p className="muted">
          Start: {start.name} → Finish: {end.name}
        </p>
      </div>
    </div>
  );
}

function buildGpx(route: RideRoute): string {
  const pts = route.points
    .map((p) => `<wpt lat="${p.lat}" lon="${p.lon}"><name>${p.name}</name></wpt>`)
    .join("");
  return `<?xml version="1.0"?><gpx version="1.1">${pts}</gpx>`;
}

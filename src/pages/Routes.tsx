import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { IconFilter, IconSearch, IconShare } from "../components/Icons";
import { loadCountries, loadRoutes } from "../lib/data";
import { PlacePhoto } from "../components/PlacePhoto";
import { validCoords } from "../lib/geo";
import type { Country, RideRoute } from "../types";

export function Routes() {
  const [rows, setRows] = useState<RideRoute[]>([]);
  const [flags, setFlags] = useState<Country[]>([]);
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [country, setCountry] = useState("");
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState(false);
  const [openList, setOpenList] = useState(false);

  useEffect(() => {
    loadRoutes().then(setRows);
    loadCountries().then(setFlags);
  }, []);

  const countries = useMemo(
    () => Array.from(new Set(rows.map((r) => r.country))).sort(),
    [rows],
  );

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (country && r.country !== country) return false;
      if (!s) return true;
      const hay = [r.title, r.subtitle, r.country, ...r.points.map((p) => p.name)]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q, country]);

  return (
    <div className="page">
      <TopBar
        title="Best Routes"
        right={
          <button
            className="icon-btn"
            onClick={() => {
              setDraft(country);
              setDraftQ(q);
              setOpenList(false);
              setFilters(true);
            }}
            aria-label="Filters"
          >
            <IconFilter />
          </button>
        }
      />
      {list.map((r) => (
        <article className="card route-card" key={r.id}>
          <div className="card-photo">
            <PlacePhoto src={r.image} alt={r.title} />
          </div>
          <div className="card-body">
            <p className="muted">{r.subtitle}</p>
            <div className="place-name">{r.title}</div>
            <Link className="btn blue" to={`/routes/${r.id}`}>
              More details
            </Link>
          </div>
        </article>
      ))}
      {list.length === 0 && <div className="empty">No routes match the filters.</div>}

      {filters && (
        <>
          <div className="backdrop" onClick={() => setFilters(false)} />
          <div className="country-sheet">
            <div className="sheet-handle" />
            <div className="globe-ico" aria-hidden>
              <svg viewBox="0 0 64 64" width="54" height="54">
                <circle cx="28" cy="30" r="16" fill="none" stroke="#222" strokeWidth="2.4" />
                <path d="M12 30h32M28 14c6 5 9 10 9 16s-3 11-9 16c-6-5-9-10-9-16s3-11 9-16z" fill="none" stroke="#222" strokeWidth="2" />
                <path d="M40 40l10 14h-8l-4-6z" fill="#222" />
              </svg>
            </div>
            <button className="country-pick" onClick={() => setOpenList((v) => !v)}>
              {draft || "All countries"}
              <span>{openList ? "▴" : "▾"}</span>
            </button>
            {openList && (
              <div className="country-menu">
                <button className={!draft ? "on" : ""} onClick={() => setDraft("")}>
                  All countries
                </button>
                {countries.map((c) => {
                  const flag = flags.find((f) => f.title === c);
                  return (
                    <button key={c} className={draft === c ? "on" : ""} onClick={() => setDraft(c)}>
                      {flag?.flag && <img src={flag.flag} alt="" width={22} height={16} />}
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
            <label className="sheet-search">
              <IconSearch />
              <input
                placeholder="Search routes, places, countries..."
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
              />
            </label>
            <button
              className="btn apply"
              onClick={() => {
                setCountry(draft);
                setQ(draftQ);
                setFilters(false);
              }}
            >
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function RouteDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [route, setRoute] = useState<RideRoute | null>(null);
  useEffect(() => {
    loadRoutes().then((all) => setRoute(all.find((r) => r.id === id) ?? null));
  }, [id]);

  if (!route) return <div className="empty">Loading…</div>;
  const start = route.points[0];
  const end = route.points[route.points.length - 1];
  const gpx = buildGpx(route);
  const total = route.days.reduce((s, d) => s + d.distanceKm, 0);

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
        <PlacePhoto src={route.image} alt="" />
      </div>
      <div className="section">
        <div className="place-name" style={{ fontSize: 26 }}>
          {route.title}
        </div>
        <p className="muted">
          {route.subtitle} · {total} km · {route.country}
        </p>
        <h3>Information</h3>
        {route.days.map((d) => (
          <div key={d.title} className="day-block">
            <b>
              {d.title}: {d.points[0]?.name} to {d.points[d.points.length - 1]?.name}
            </b>
            <p className="muted">{d.distanceKm} km</p>
            <ul>
              {d.points.map((p) => (
                <li key={`${p.name}-${p.lat}`}>{p.name}</li>
              ))}
            </ul>
            <p>{d.description}</p>
          </div>
        ))}
        <div className="row-btns">
          <button
            className="btn blue"
            onClick={() => {
              const pts = route.points.filter((p) => validCoords(p.lat, p.lon));
              if (!pts.length) return;
              nav(`/map?via=${pts.map((p) => `${p.lat},${p.lon}`).join("|")}`);
            }}
          >
            Let's ride!
          </button>
          <a
            className="btn white small"
            href={route.gpxUrl ?? URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }))}
            download={`${route.id}.gpx`}
          >
            GPX
          </a>
        </div>
        {start && end && (
          <p className="muted">
            Start: {start.name} → Finish: {end.name}
          </p>
        )}
      </div>
    </div>
  );
}

function buildGpx(route: RideRoute): string {
  const pts = route.points
    .map((p) => `<wpt lat="${p.lat}" lon="${p.lon}"><name>${escapeXml(p.name)}</name></wpt>`)
    .join("");
  return `<?xml version="1.0"?><gpx version="1.1">${pts}</gpx>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

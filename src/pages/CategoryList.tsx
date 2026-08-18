import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { ObjectCard } from "../components/ObjectCard";
import { IconEco, IconFilter, IconNear, IconPinStar, IconSearch } from "../components/Icons";
import { CATEGORIES } from "../lib/categories";
import { byCategory, loadCountries, loadPlaces } from "../lib/data";
import { haversineKm } from "../lib/geo";
import type { Country, Place, PlaceType } from "../types";

export function CategoryList() {
  const { category } = useParams();
  const meta = CATEGORIES.find((c) => c.id === category);
  const [places, setPlaces] = useState<Place[]>([]);
  const [flags, setFlags] = useState<Country[]>([]);
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [country, setCountry] = useState("");
  const [draft, setDraft] = useState("");
  const [friendly, setFriendly] = useState(false);
  const [draftFriendly, setDraftFriendly] = useState(false);
  const [eco, setEco] = useState(false);
  const [draftEco, setDraftEco] = useState(false);
  const [near, setNear] = useState(false);
  const [draftNear, setDraftNear] = useState(false);
  const [filters, setFilters] = useState(false);
  const [openList, setOpenList] = useState(false);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [limit, setLimit] = useState(12);

  useEffect(() => {
    loadPlaces().then(setPlaces);
    loadCountries().then(setFlags);
    navigator.geolocation?.getCurrentPosition(
      (p) => setHere({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setHere({ lat: 42.43, lon: 19.26 }),
    );
  }, []);

  const type = meta?.type as PlaceType | undefined;
  const list = useMemo(() => {
    if (!type) return [];
    let rows = byCategory(places, type);
    if (q) {
      const s = q.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.city.toLowerCase().includes(s) ||
          p.country.toLowerCase().includes(s) ||
          (p.address ?? "").toLowerCase().includes(s),
      );
    }
    if (country) rows = rows.filter((p) => p.country === country);
    if (friendly) rows = rows.filter((p) => p.bikersFriendly);
    if (eco) rows = rows.filter((p) => (p.amenities ?? []).some((a) => /eco/i.test(a)) || /eco/i.test(p.name));
    const withDist = rows.map((p) => ({
      p,
      d: here ? haversineKm(here, { lat: p.lat, lon: p.lon }) : undefined,
    }));
    const limited = near ? withDist.filter((x) => (x.d ?? 9e9) <= 50) : withDist;
    limited.sort((a, b) => (b.p.rating ?? 0) - (a.p.rating ?? 0));
    return limited;
  }, [places, type, q, country, friendly, eco, near, here]);

  const countries = useMemo(
    () => Array.from(new Set(byCategory(places, type ?? "hotels").map((p) => p.country))).sort(),
    [places, type],
  );

  if (!meta || !type) return <div className="empty">Unknown category</div>;
  const showEco = type === "hotels";

  return (
    <div className="page">
      <TopBar
        title={meta.title}
        right={
          <button
            className="icon-btn"
            onClick={() => {
              setDraft(country);
              setDraftQ(q);
              setDraftFriendly(friendly);
              setDraftEco(eco);
              setDraftNear(near);
              setOpenList(false);
              setFilters(true);
            }}
            aria-label="Filters"
          >
            <IconFilter />
          </button>
        }
      />
      {list.slice(0, limit).map(({ p, d }) => (
        <ObjectCard key={p.id} place={p} distanceKm={d} />
      ))}
      {limit < list.length && (
        <div className="pad">
          <button className="btn ghost" onClick={() => setLimit((n) => n + 12)}>
            Load more ({list.length - limit})
          </button>
        </div>
      )}
      {list.length === 0 && <div className="empty">No places match the filters.</div>}

      {filters && (
        <>
          <div className="backdrop" onClick={() => setFilters(false)} />
          <div className="country-sheet">
            <div className="sheet-handle" />
            <div className="globe-ico" aria-hidden>
              <svg viewBox="0 0 64 64" width="54" height="54">
                <circle cx="28" cy="30" r="16" fill="none" stroke="#222" strokeWidth="2.4" />
                <path
                  d="M12 30h32M28 14c6 5 9 10 9 16s-3 11-9 16c-6-5-9-10-9-16s3-11 9-16z"
                  fill="none"
                  stroke="#222"
                  strokeWidth="2"
                />
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
                placeholder="Search..."
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
              />
            </label>
            <div className="filter-icons">
              <button
                type="button"
                className={draftFriendly ? "on" : ""}
                onClick={() => setDraftFriendly((v) => !v)}
              >
                <span className="filter-ico">
                  <IconPinStar />
                </span>
                Bikers friendly
              </button>
              {showEco && (
                <button type="button" className={draftEco ? "on" : ""} onClick={() => setDraftEco((v) => !v)}>
                  <span className="filter-ico">
                    <IconEco />
                  </span>
                  Eco village
                </button>
              )}
              <button type="button" className={draftNear ? "on" : ""} onClick={() => setDraftNear((v) => !v)}>
                <span className="filter-ico">
                  <IconNear />
                </span>
                Within 50 km
              </button>
            </div>
            <button
              className="btn apply"
              onClick={() => {
                setCountry(draft);
                setQ(draftQ);
                setFriendly(draftFriendly);
                setEco(draftEco);
                setNear(draftNear);
                setLimit(12);
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

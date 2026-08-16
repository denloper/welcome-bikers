import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { ObjectCard } from "../components/ObjectCard";
import { IconFilter } from "../components/Icons";
import { CATEGORIES } from "../lib/categories";
import { byCategory, loadPlaces } from "../lib/data";
import { haversineKm } from "../lib/geo";
import type { Place, PlaceType } from "../types";

type Sort = "distance" | "rating" | "reviews" | "newest";

export function CategoryList() {
  const { category } = useParams();
  const meta = CATEGORIES.find((c) => c.id === category);
  const [places, setPlaces] = useState<Place[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("rating");
  const [country, setCountry] = useState("");
  const [friendly, setFriendly] = useState(false);
  const [filters, setFilters] = useState(false);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [limit, setLimit] = useState(12);

  useEffect(() => {
    loadPlaces().then(setPlaces);
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
          p.country.toLowerCase().includes(s),
      );
    }
    if (country) rows = rows.filter((p) => p.country === country);
    if (friendly) rows = rows.filter((p) => p.bikersFriendly);
    const withDist = rows.map((p) => ({
      p,
      d: here ? haversineKm(here, { lat: p.lat, lon: p.lon }) : undefined,
    }));
    withDist.sort((a, b) => {
      if (sort === "distance") return (a.d ?? 9e9) - (b.d ?? 9e9);
      if (sort === "rating") return (b.p.rating ?? 0) - (a.p.rating ?? 0);
      if (sort === "reviews") return b.p.reviews - a.p.reviews;
      return b.p.id - a.p.id;
    });
    return withDist;
  }, [places, type, q, sort, country, friendly, here]);

  const countries = useMemo(
    () =>
      Array.from(new Set(byCategory(places, type ?? "hotels").map((p) => p.country))).sort(),
    [places, type],
  );

  if (!meta || !type) return <div className="empty">Unknown category</div>;

  return (
    <div className="page">
      <TopBar
        title={meta.title}
        right={
          <button className="icon-btn" onClick={() => setFilters(true)} aria-label="Filters">
            <IconFilter />
          </button>
        }
      />
      <div className="search-row">
        <input
          placeholder="Search name, city..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(12);
          }}
        />
      </div>
      <div className="filters">
        {(["rating", "distance", "reviews", "newest"] as Sort[]).map((s) => (
          <button key={s} className={`chip ${sort === s ? "on" : ""}`} onClick={() => setSort(s)}>
            {s}
          </button>
        ))}
      </div>
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
          <div className="sheet">
            <h3>Filters</h3>
            <label className="lbl">Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label style={{ display: "flex", gap: 8, margin: "12px 0" }}>
              <input type="checkbox" checked={friendly} onChange={(e) => setFriendly(e.target.checked)} />
              Bikers friendly only
            </label>
            <button className="btn blue" onClick={() => setFilters(false)}>
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}

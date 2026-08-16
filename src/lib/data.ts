import type { Place, PlaceType, RideRoute } from "../types";
import { asset } from "./assets";
import { DEFAULT_AMENITIES, OVERRIDES } from "./overrides";
import { store } from "./store";

let cache: Place[] | null = null;
let routesCache: RideRoute[] | null = null;

function enrich(raw: Place): Place {
  const extra = OVERRIDES[raw.id] ?? {};
  const type = (extra.types?.[0] ?? raw.types[0]) as PlaceType;
  return {
    ...raw,
    ...extra,
    types: extra.types ?? raw.types,
    rating: extra.rating ?? raw.rating,
    amenities: extra.amenities ?? DEFAULT_AMENITIES[type] ?? [],
    status: extra.status ?? "published",
    address: extra.address ?? [raw.city, raw.country].filter(Boolean).join(", "),
    description:
      extra.description ??
      `${raw.name} is a ${type.replace(/s$/, "")} in ${raw.city}, ${raw.country}.`,
  };
}

export async function loadPlaces(): Promise<Place[]> {
  if (cache) return cache;
  const res = await fetch(asset("data/objects.json"));
  const rows = (await res.json()) as Place[];
  const pending = (store.get().pendingPlaces as Place[]) ?? [];
  cache = [...pending.map(enrich), ...rows.map(enrich)];
  return cache;
}

export function invalidatePlaces() {
  cache = null;
}

export async function loadRoutes(): Promise<RideRoute[]> {
  if (routesCache) return routesCache;
  const res = await fetch(asset("data/routes.json"));
  routesCache = ((await res.json()) as RideRoute[]).map((r) => ({
    ...r,
    image: asset(r.image),
  }));
  return routesCache;
}

export function byCategory(places: Place[], type: PlaceType): Place[] {
  return places.filter((p) => p.types.includes(type) && p.status !== "pending");
}

export function getPlace(places: Place[], id: number): Place | undefined {
  return places.find((p) => p.id === id);
}

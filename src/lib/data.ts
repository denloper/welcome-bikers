import type { ChatMessage, Country, HotelRoom, Place, PlaceType, Review, RideRoute, SosAlert } from "../types";
import { asset } from "./assets";
import { fetchJson } from "./net";
import { DEFAULT_AMENITIES, OVERRIDES } from "./overrides";
import { store } from "./store";

let cache: Place[] | null = null;
let routesCache: RideRoute[] | null = null;
let reviewsCache: Review[] | null = null;
let roomsCache: HotelRoom[] | null = null;
let countriesCache: Country[] | null = null;
let chatCache: ChatMessage[] | null = null;
let sosCache: SosAlert[] | null = null;

async function loadArray<T>(path: string): Promise<T[]> {
  const value = await fetchJson<unknown>(asset(path));
  if (!Array.isArray(value)) throw new Error(`Invalid data file: ${path}`);
  return value as T[];
}

function enrich(raw: Place): Place {
  const extra = OVERRIDES[raw.id] ?? {};
  const type = (extra.types?.[0] ?? raw.types[0]) as PlaceType;
  return {
    ...raw,
    ...extra,
    types: extra.types ?? raw.types,
    rating: extra.rating ?? raw.rating,
    amenities: extra.amenities ?? raw.amenities ?? DEFAULT_AMENITIES[type] ?? [],
    photos: extra.photos ?? raw.photos,
    status: extra.status ?? raw.status ?? "published",
    openingHours: extra.openingHours ?? raw.openingHours ?? "Hours on request",
    address: extra.address ?? raw.address ?? [raw.city, raw.country].filter(Boolean).join(", "),
    description:
      extra.description ??
      raw.description ??
      `${raw.name} is a ${type.replace(/s$/, "")} in ${raw.city}, ${raw.country}.`,
  };
}

export async function loadPlaces(): Promise<Place[]> {
  if (cache) return cache;
  const rows = await loadArray<Place>("data/objects.json");
  const pending = (store.get().pendingPlaces as Place[]) ?? [];
  cache = [...pending.map(enrich), ...rows.map(enrich)];
  return cache;
}

export function invalidatePlaces() {
  cache = null;
}

export async function loadRoutes(): Promise<RideRoute[]> {
  if (routesCache) return routesCache;
  routesCache = (await loadArray<RideRoute>("data/routes.json")).map((r) => ({
    ...r,
    image: asset(r.image),
    gpxUrl: r.gpxUrl ? asset(r.gpxUrl) : undefined,
  }));
  return routesCache;
}

export async function loadReviews(): Promise<Review[]> {
  if (reviewsCache) return reviewsCache;
  reviewsCache = await loadArray<Review>("data/reviews.json");
  return reviewsCache;
}

export async function loadHotelRooms(): Promise<HotelRoom[]> {
  if (roomsCache) return roomsCache;
  roomsCache = await loadArray<HotelRoom>("data/hotel-rooms.json");
  return roomsCache;
}

export async function loadCountries(): Promise<Country[]> {
  if (countriesCache) return countriesCache;
  countriesCache = await loadArray<Country>("data/countries.json");
  return countriesCache;
}

export async function loadChat(): Promise<ChatMessage[]> {
  if (chatCache) return chatCache;
  chatCache = (await loadArray<ChatMessage>("data/chat.json")).filter((m) => m.text || m.image);
  return chatCache;
}

export async function loadSos(): Promise<SosAlert[]> {
  if (sosCache) return sosCache;
  sosCache = await loadArray<SosAlert>("data/sos.json");
  return sosCache;
}

export function byCategory(places: Place[], type: PlaceType): Place[] {
  return places.filter((p) => p.types.includes(type) && p.status !== "pending");
}

export function getPlace(places: Place[], id: string | undefined): Place | undefined {
  if (!id) return undefined;
  return places.find((p) => p.id === id);
}

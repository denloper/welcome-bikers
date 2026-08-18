import type { ChatMessage, Country, HotelRoom, Place, PlaceType, Review, RideRoute, SosAlert } from "../types";
import { asset } from "./assets";
import { defaultHours } from "./hours";
import { DEFAULT_AMENITIES, OVERRIDES } from "./overrides";
import { store } from "./store";

let cache: Place[] | null = null;
let routesCache: RideRoute[] | null = null;
let reviewsCache: Review[] | null = null;
let roomsCache: HotelRoom[] | null = null;
let countriesCache: Country[] | null = null;
let chatCache: ChatMessage[] | null = null;
let sosCache: SosAlert[] | null = null;

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
    openingHours:
      extra.openingHours ??
      (raw.openingHours && raw.openingHours !== "Hours on request" ? raw.openingHours : defaultHours(type)),
    address: extra.address ?? raw.address ?? [raw.city, raw.country].filter(Boolean).join(", "),
    description:
      extra.description ??
      raw.description ??
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
    gpxUrl: r.gpxUrl ? asset(r.gpxUrl) : undefined,
  }));
  return routesCache;
}

export async function loadReviews(): Promise<Review[]> {
  if (reviewsCache) return reviewsCache;
  const res = await fetch(asset("data/reviews.json"));
  reviewsCache = (await res.json()) as Review[];
  return reviewsCache;
}

export async function loadHotelRooms(): Promise<HotelRoom[]> {
  if (roomsCache) return roomsCache;
  const res = await fetch(asset("data/hotel-rooms.json"));
  roomsCache = (await res.json()) as HotelRoom[];
  return roomsCache;
}

export async function loadCountries(): Promise<Country[]> {
  if (countriesCache) return countriesCache;
  const res = await fetch(asset("data/countries.json"));
  countriesCache = (await res.json()) as Country[];
  return countriesCache;
}

export async function loadChat(): Promise<ChatMessage[]> {
  if (chatCache) return chatCache;
  const res = await fetch(asset("data/chat.json"));
  chatCache = ((await res.json()) as ChatMessage[]).filter((m) => m.text || m.image);
  return chatCache;
}

export async function loadSos(): Promise<SosAlert[]> {
  if (sosCache) return sosCache;
  const res = await fetch(asset("data/sos.json"));
  sosCache = (await res.json()) as SosAlert[];
  return sosCache;
}

export function byCategory(places: Place[], type: PlaceType): Place[] {
  return places.filter((p) => p.types.includes(type) && p.status !== "pending");
}

export function getPlace(places: Place[], id: string | undefined): Place | undefined {
  if (!id) return undefined;
  return places.find((p) => p.id === id);
}

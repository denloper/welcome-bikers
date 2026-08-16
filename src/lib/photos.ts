import type { Place, PlaceType } from "../types";
import { asset } from "./assets";

const POOL: Record<PlaceType, string[]> = {
  hotels: [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=70",
  ],
  shops: [
    "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=70",
  ],
  bars: [
    "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1572118886163-5a8d1a099d54?auto=format&fit=crop&w=1200&q=70",
  ],
  restaurants: [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=70",
  ],
  services: [
    "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1632823471565-1ecdf22868a0?auto=format&fit=crop&w=1200&q=70",
  ],
  rent: [
    "https://images.unsplash.com/photo-1558980664-2506fca6bfc2?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1449426468159-d96dbf6334bf?auto=format&fit=crop&w=1200&q=70",
  ],
  festivals: [
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1200&q=70",
  ],
  viewpoints: [
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=70",
  ],
  historical: [
    "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1525874684015-58379d421a52?auto=format&fit=crop&w=1200&q=70",
  ],
};

export const BANNERS = [
  {
    image: asset("icons/banner.jpg"),
    title: "",
    to: "/objects/hotels",
  },
  {
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1400&q=80",
    title: "BEST ROADS OF THE BALKANS",
    to: "/routes",
  },
  {
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=80",
    title: "FESTIVALS ON THE ROUTE",
    to: "/objects/festivals",
  },
];

export function photosFor(place: Place): string[] {
  if (place.photos?.length) return place.photos.map(asset);
  const type = place.types[0] ?? "hotels";
  const pool = POOL[type];
  const a = pool[place.id % pool.length];
  const b = pool[(place.id + 1) % pool.length];
  return [a, b];
}

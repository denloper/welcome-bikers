import type { Place } from "../types";

export const OVERRIDES: Record<string, Partial<Place>> = {
  "66xiewxec4yj9yzxw18h35v8": {
    slogan: "Try it to feel it!",
    openingHours: "24/7",
    website: "https://welcomebikers.eu",
    bikersFriendly: true,
  },
};

export const DEFAULT_AMENITIES: Record<string, string[]> = {
  hotels: ["Bikers friendly", "Card payment", "Wi-Fi", "Moto Parking"],
  shops: ["Spare parts", "Gear", "Card payment"],
  bars: ["Bikers friendly", "Food & Beverages"],
  restaurants: ["Card payment", "Food & Beverages"],
  services: ["Motorcycle service", "Card payment"],
  rent: ["Helmet included", "Card payment"],
  festivals: ["Live music", "Camping"],
  viewpoints: ["Photo spot", "Parking"],
  historical: ["Guided tours"],
};

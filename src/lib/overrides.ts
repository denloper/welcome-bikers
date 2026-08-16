import type { Place } from "../types";

export const OVERRIDES: Record<number, Partial<Place>> = {
  404: {
    rating: 4.6,
    reviews: 67,
    address: "Pedišica 26 Braće Grakalić, 85340 Herceg Novi, Montenegro",
    slogan: "Try it to feel it!",
    openingHours: "24/7",
    description:
      "Hotel Maksim is in Herceg Novi, Montenegro. A curated tourist program includes boat trips, excursions, fishing, biking and cycling — a warm stop for riders crossing the Adriatic coast.",
    amenities: [
      "Bikers friendly",
      "Card payment",
      "Wi-Fi",
      "Motorcycle Parking",
      "Motorcycle wash",
      "Food & Beverages",
    ],
    photos: ["/photos/maksim.jpg"],
    website: "https://welcomebikers.eu",
    bikersFriendly: true,
  },
};

export const DEFAULT_AMENITIES: Record<string, string[]> = {
  hotels: ["Bikers friendly", "Card payment", "Wi-Fi", "Motorcycle Parking"],
  shops: ["Spare parts", "Gear", "Card payment"],
  bars: ["Bikers friendly", "Food & Beverages"],
  restaurants: ["Card payment", "Food & Beverages"],
  services: ["Motorcycle service", "Card payment"],
  rent: ["Helmet included", "Card payment"],
  festivals: ["Live music", "Camping"],
  viewpoints: ["Photo spot", "Parking"],
  historical: ["Guided tours"],
};

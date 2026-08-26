import type { CategoryId, PlaceType } from "../types";

export const PLACE_TYPES: readonly PlaceType[] = [
  "hotels",
  "shops",
  "bars",
  "restaurants",
  "services",
  "rent",
  "festivals",
  "viewpoints",
  "historical",
];

export const CATEGORIES: {
  id: CategoryId;
  label: string;
  title: string;
  type?: PlaceType;
  accent?: "red";
}[] = [
  { id: "hotels", label: "Hotels", title: "Hotels", type: "hotels" },
  { id: "shops", label: "Moto shops", title: "Moto Shops", type: "shops" },
  { id: "bars", label: "Bikers bars", title: "Bikers bars", type: "bars" },
  { id: "restaurants", label: "Restaurants", title: "Restaurants", type: "restaurants" },
  { id: "services", label: "Services", title: "Services", type: "services" },
  { id: "rent", label: "Rent a bike", title: "Rent a bike", type: "rent" },
  { id: "festivals", label: "Festivals", title: "Festivals", type: "festivals" },
  { id: "routes", label: "Best Routes", title: "Best Routes" },
  { id: "viewpoints", label: "Viewpoints", title: "Viewpoints", type: "viewpoints" },
  { id: "add", label: "Add your places", title: "Add your place", accent: "red" },
  { id: "help", label: "Help on the route", title: "Help on the route", accent: "red" },
  { id: "historical", label: "Historical places", title: "Historical places", type: "historical" },
];

export const TYPE_CHIP: Record<PlaceType, string> = {
  hotels: "Hotels",
  shops: "Moto Shops",
  bars: "Bikers Bars",
  restaurants: "Restaurants",
  services: "Services",
  rent: "Rent a Bike",
  festivals: "Festivals",
  viewpoints: "Viewpoints",
  historical: "Historical Places",
};

export const TYPE_LABEL: Record<PlaceType, string> = {
  hotels: "Hotel",
  shops: "Moto shop",
  bars: "Bikers bar",
  restaurants: "Restaurant",
  services: "Service",
  rent: "Rent a bike",
  festivals: "Festival",
  viewpoints: "Viewpoint",
  historical: "Historical place",
};

export const TYPE_COLOR: Record<PlaceType, string> = {
  hotels: "#1f1f1f",
  shops: "#c1121f",
  bars: "#1f1f1f",
  restaurants: "#1f1f1f",
  services: "#c1121f",
  rent: "#1f1f1f",
  festivals: "#c1121f",
  viewpoints: "#c1121f",
  historical: "#c1121f",
};

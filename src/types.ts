export type CategoryId =
  | "hotels"
  | "shops"
  | "bars"
  | "restaurants"
  | "services"
  | "rent"
  | "festivals"
  | "routes"
  | "viewpoints"
  | "add"
  | "help"
  | "historical";

export type PlaceType =
  | "hotels"
  | "shops"
  | "bars"
  | "restaurants"
  | "services"
  | "rent"
  | "festivals"
  | "viewpoints"
  | "historical";

export type Place = {
  id: number;
  name: string;
  types: PlaceType[];
  country: string;
  city: string;
  lat: number;
  lon: number;
  rating: number | null;
  reviews: number;
  video: string | null;
  bikersFriendly: boolean;
  address?: string;
  description?: string;
  slogan?: string;
  phone?: string;
  website?: string;
  email?: string;
  photos?: string[];
  openingHours?: string;
  amenities?: string[];
  status?: "published" | "pending";
  createdBy?: string;
};

export type RouteStop = { name: string; lat: number; lon: number };

export type RideRoute = {
  id: string;
  title: string;
  subtitle: string;
  country: string;
  days: string[];
  image: string;
  points: RouteStop[];
};

export type User = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  emailVerified: boolean;
  friends: string[];
};

export type ChatMessage = {
  id: string;
  room: string;
  userId: string;
  name: string;
  text: string;
  createdAt: number;
};

export type Review = {
  id: string;
  placeId: number;
  userId: string;
  name: string;
  rating: number;
  text: string;
  createdAt: number;
};

export type Booking = {
  id: string;
  placeId: number;
  placeName: string;
  from: string;
  to: string;
  createdAt: number;
  status: "requested" | "confirmed" | "cancelled";
};

import type { Place, PlaceType } from "../types";

export function fullAddress(place: Place): string {
  const country = place.country?.trim() ?? "";
  const city = place.city?.trim() ?? "";
  let street = (place.address ?? "").trim();
  const lower = street.toLowerCase();
  if (country && lower.startsWith(country.toLowerCase())) {
    street = street.slice(country.length).replace(/^,\s*/, "");
  }
  if (city && street.toLowerCase().startsWith(city.toLowerCase())) {
    street = street.slice(city.length).replace(/^,\s*/, "");
  }
  return [country, city, street].filter(Boolean).join(", ");
}

export function defaultHours(type: PlaceType): string {
  if (type === "shops" || type === "services" || type === "rent") return "08:00 - 16:00";
  if (type === "restaurants") return "10:00 - 22:00";
  if (type === "bars") return "18:00 - 02:00";
  return "24/7";
}

export function weekSchedule(hours?: string): { day: string; hours: string }[] {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (hours === "24/7") return days.map((day) => ({ day, hours: "24 hours" }));
  if (!hours || hours === "Hours on request") return days.map((day) => ({ day, hours: "On request" }));
  return days.map((day) => ({
    day,
    hours: day === "Sun" ? "Closed" : day === "Sat" ? "09:00 - 14:00" : hours,
  }));
}

export function todayHours(hours?: string): { open: string; detail: string } {
  if (hours === "24/7") return { open: "Open now", detail: "24/7" };
  if (!hours || hours === "Hours on request") return { open: "Hours on request", detail: "" };
  return { open: "Open now", detail: hours };
}

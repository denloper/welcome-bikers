import { expect, test } from "@playwright/test";
import { categoryReply, matchPlaces, parseIntent, topByCategory } from "../src/lib/assistant";
import type { Place } from "../src/types";

function fakePlace(over: Partial<Place>): Place {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Place",
    types: ["bars"],
    country: "Montenegro",
    city: "Podgorica",
    lat: 42.44,
    lon: 19.26,
    rating: 4,
    reviews: 10,
    video: null,
    bikersFriendly: false,
    ...over,
  };
}

const PLACES: Place[] = [
  fakePlace({ name: "Magnus Moto", types: ["shops"], rating: 4.5 }),
  fakePlace({ name: "Moto Bar Old Town", types: ["bars"], city: "Kotor", rating: 4.8 }),
  fakePlace({ name: "Highway Bar", types: ["bars"], rating: 4.1 }),
  fakePlace({ name: "Beer House", types: ["bars"], country: "Serbia", city: "Belgrade", rating: 4.9 }),
  fakePlace({ name: "Moto Fest Budva", types: ["festivals"], city: "Budva", rating: 5 }),
  fakePlace({ name: "Hidden Bar", types: ["bars"], rating: 3.2, status: "pending" }),
];

test("parses Russian ride phrases", () => {
  expect(parseIntent("Поехали в Подгорицу")).toEqual({ kind: "ride", query: "подгорицу" });
  expect(parseIntent("маршрут до Котора")).toEqual({ kind: "ride", query: "котора" });
  expect(parseIntent("как доехать до Будвы?")).toEqual({ kind: "ride", query: "будвы" });
});

test("parses English ride phrases", () => {
  expect(parseIntent("Ride to Magnus Moto")).toEqual({ kind: "ride", query: "magnus moto" });
  expect(parseIntent("take me to Kotor")).toEqual({ kind: "ride", query: "kotor" });
});

test("parses category questions with a country", () => {
  expect(parseIntent("Какие бары есть в Черногории?")).toEqual({
    kind: "category",
    type: "bars",
    country: "Montenegro",
  });
  expect(parseIntent("какие фестивали в Сербии")).toEqual({
    kind: "category",
    type: "festivals",
    country: "Serbia",
  });
  expect(parseIntent("what festivals are in Serbia")).toEqual({
    kind: "category",
    type: "festivals",
    country: "Serbia",
  });
  expect(parseIntent("покажи отели")).toEqual({ kind: "category", type: "hotels", country: undefined });
});

test("falls back to unknown for small talk", () => {
  expect(parseIntent("привет как дела").kind).toBe("unknown");
  expect(parseIntent("").kind).toBe("unknown");
});

test("matchPlaces finds a place by fuzzy name and skips pending", () => {
  expect(matchPlaces(PLACES, "magnus moto")[0]?.name).toBe("Magnus Moto");
  expect(matchPlaces(PLACES, "magnus")[0]?.name).toBe("Magnus Moto");
  expect(matchPlaces(PLACES, "moto bar old town")[0]?.name).toBe("Moto Bar Old Town");
  expect(matchPlaces(PLACES, "hidden bar")).toHaveLength(0);
  expect(matchPlaces(PLACES, "nonexistent xyz")).toHaveLength(0);
});

test("topByCategory filters by country, sorts by rating and skips pending", () => {
  const bars = topByCategory(PLACES, "bars", "Montenegro");
  expect(bars.map((p) => p.name)).toEqual(["Moto Bar Old Town", "Highway Bar"]);
  const all = topByCategory(PLACES, "bars");
  expect(all[0].name).toBe("Beer House");
  expect(all.some((p) => p.name === "Hidden Bar")).toBe(false);
});

test("categoryReply speaks Russian plurals and the country", () => {
  expect(categoryReply(5, "festivals", "Montenegro", true)).toContain("5 фестивалей в Черногории");
  expect(categoryReply(2, "bars", "Serbia", true)).toContain("2 байкерских бара в Сербии");
  expect(categoryReply(0, "bars", undefined, true)).toContain("не нашёл");
  expect(categoryReply(3, "bars", "Montenegro", false)).toContain("3 bikers bars in Montenegro");
});

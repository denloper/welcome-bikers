import type { Place, PlaceType } from "../types";

export type AssistantIntent =
  | { kind: "ride"; query: string }
  | { kind: "category"; type: PlaceType; country?: string }
  | { kind: "unknown" };

export function isRu(text: string): boolean {
  return /[а-яё]/i.test(text);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RIDE_RE: RegExp[] = [
  /(?:поехали|поедем|поехать|погнали|едем|гони|вези|отвези)(?:\s+меня)?\s+(?:в|во|до|на|к)\s+(.+)/,
  /(?:маршрут|дорога|путь|доехать|добраться|проехать)\s+(?:до|в|во|на|к)\s+(.+)/,
  /(?:ride|go|drive|navigate|route|directions)\s+to\s+(.+)/,
  /take\s+me\s+to\s+(.+)/,
  /how\s+(?:do\s+i|can\s+i|to)\s+get\s+to\s+(.+)/,
];

const CATEGORY_STEMS: { type: PlaceType; stems: string[] }[] = [
  { type: "festivals", stems: ["фестивал", "фест", "festival", "fest"] },
  { type: "hotels", stems: ["отел", "гостиниц", "хостел", "ночлег", "hotel", "hostel"] },
  { type: "shops", stems: ["мотомагазин", "магазин", "shop", "store"] },
  { type: "bars", stems: ["бар", "паб", "пивн", "bar", "pub"] },
  { type: "restaurants", stems: ["ресторан", "кафе", "поесть", "restaurant", "cafe"] },
  { type: "services", stems: ["сервис", "ремонт", "мастерск", "service", "repair", "workshop"] },
  { type: "rent", stems: ["аренд", "прокат", "rent"] },
  { type: "viewpoints", stems: ["видов", "смотров", "viewpoint", "view"] },
  { type: "historical", stems: ["историч", "достопримечательн", "historic", "sight"] },
];

const COUNTRIES: { canon: string; ru: string; stems: string[] }[] = [
  { canon: "Montenegro", ru: "Черногории", stems: ["черногор", "montenegro"] },
  { canon: "Serbia", ru: "Сербии", stems: ["серби", "serbia"] },
  { canon: "Bosnia and Herzegovina", ru: "Боснии", stems: ["босни", "bosnia"] },
  { canon: "North Macedonia", ru: "Северной Македонии", stems: ["македони", "macedonia"] },
  { canon: "Croatia", ru: "Хорватии", stems: ["хорват", "croatia"] },
  { canon: "Albania", ru: "Албании", stems: ["албани", "albania"] },
  { canon: "Slovenia", ru: "Словении", stems: ["словени", "slovenia"] },
  { canon: "Hungary", ru: "Венгрии", stems: ["венгри", "hungary"] },
  { canon: "Romania", ru: "Румынии", stems: ["румын", "romania"] },
  { canon: "Austria", ru: "Австрии", stems: ["австри", "austria"] },
  { canon: "Bulgaria", ru: "Болгарии", stems: ["болгар", "bulgaria"] },
  { canon: "Germany", ru: "Германии", stems: ["германи", "germany"] },
  { canon: "Slovakia", ru: "Словакии", stems: ["словаки", "slovakia"] },
  { canon: "Poland", ru: "Польше", stems: ["польш", "poland"] },
  { canon: "Czech Republic", ru: "Чехии", stems: ["чехи", "czech"] },
  { canon: "Switzerland", ru: "Швейцарии", stems: ["швейцар", "switzerland"] },
  { canon: "Belgium", ru: "Бельгии", stems: ["бельги", "belgium"] },
  { canon: "Denmark", ru: "Дании", stems: ["дании", "дания", "denmark"] },
  { canon: "Italy", ru: "Италии", stems: ["итали", "italy"] },
  { canon: "India", ru: "Индии", stems: ["индии", "индия", "india"] },
  { canon: "Nepal", ru: "Непале", stems: ["непал", "nepal"] },
  { canon: "Netherlands", ru: "Нидерландах", stems: ["нидерланд", "голланд", "netherlands", "holland"] },
  { canon: "Portugal", ru: "Португалии", stems: ["португал", "portugal"] },
  { canon: "Ireland", ru: "Ирландии", stems: ["ирланди", "ireland"] },
  { canon: "Latvia", ru: "Латвии", stems: ["латви", "latvia"] },
  { canon: "France", ru: "Франции", stems: ["франци", "france"] },
  { canon: "Spain", ru: "Испании", stems: ["испани", "spain"] },
  { canon: "Finland", ru: "Финляндии", stems: ["финлянд", "finland"] },
  { canon: "United Kingdom", ru: "Великобритании", stems: ["великобритани", "англи", "britain", "england"] },
  { canon: "Greece", ru: "Греции", stems: ["греци", "greece"] },
  { canon: "Sweden", ru: "Швеции", stems: ["швеци", "sweden"] },
  { canon: "Luxembourg", ru: "Люксембурге", stems: ["люксембург", "luxembourg"] },
];

function detectCategory(t: string): PlaceType | null {
  const tokens = t.split(" ");
  for (const cat of CATEGORY_STEMS) {
    if (cat.stems.some((stem) => tokens.some((w) => w.startsWith(stem)))) return cat.type;
  }
  return null;
}

function detectCountry(t: string): string | undefined {
  const tokens = t.split(" ");
  for (const c of COUNTRIES) {
    if (c.stems.some((stem) => tokens.some((w) => w.startsWith(stem)))) return c.canon;
  }
  return undefined;
}

export function parseIntent(text: string): AssistantIntent {
  const t = norm(text);
  if (!t) return { kind: "unknown" };
  for (const re of RIDE_RE) {
    const m = t.match(re);
    if (m?.[1]?.trim()) return { kind: "ride", query: m[1].trim() };
  }
  const type = detectCategory(t);
  if (type) return { kind: "category", type, country: detectCountry(t) };
  return { kind: "unknown" };
}

function placeScore(p: Place, q: string, qTokens: string[]): number {
  const name = norm(p.name);
  if (!name) return 0;
  if (name === q) return 100;
  if (name.includes(q) || q.includes(name)) return 85;
  const city = norm(p.city);
  if (city && city === q) return 60;
  const hay = `${name} ${city} ${norm(p.country)}`.split(" ");
  if (!qTokens.length) return 0;
  const hit = qTokens.filter((t) => hay.some((h) => h.startsWith(t))).length;
  if (hit === qTokens.length) return 70;
  return Math.round((hit / qTokens.length) * 40);
}

/** Fuzzy match of a spoken destination against the places base. */
export function matchPlaces(places: Place[], query: string, limit = 3): Place[] {
  const q = norm(query);
  if (!q) return [];
  const qTokens = q.split(" ").filter((w) => w.length > 1);
  return places
    .filter((p) => p.status !== "pending")
    .map((p) => ({ p, s: placeScore(p, q, qTokens) }))
    .filter((x) => x.s >= 45)
    .sort((a, b) => b.s - a.s || (b.p.rating ?? 0) - (a.p.rating ?? 0))
    .slice(0, limit)
    .map((x) => x.p);
}

export function topByCategory(places: Place[], type: PlaceType, country?: string, limit = 5): Place[] {
  return places
    .filter((p) => p.status !== "pending" && p.types.includes(type) && (!country || p.country === country))
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviews - a.reviews)
    .slice(0, limit);
}

const CATEGORY_RU: Record<PlaceType, [string, string, string]> = {
  hotels: ["отель", "отеля", "отелей"],
  shops: ["мотомагазин", "мотомагазина", "мотомагазинов"],
  bars: ["байкерский бар", "байкерских бара", "байкерских баров"],
  restaurants: ["ресторан", "ресторана", "ресторанов"],
  services: ["сервис", "сервиса", "сервисов"],
  rent: ["прокат мотоциклов", "проката мотоциклов", "прокатов мотоциклов"],
  festivals: ["фестиваль", "фестиваля", "фестивалей"],
  viewpoints: ["смотровую точку", "смотровые точки", "смотровых точек"],
  historical: ["историческое место", "исторических места", "исторических мест"],
};

const CATEGORY_EN: Record<PlaceType, [string, string]> = {
  hotels: ["hotel", "hotels"],
  shops: ["moto shop", "moto shops"],
  bars: ["bikers bar", "bikers bars"],
  restaurants: ["restaurant", "restaurants"],
  services: ["service", "services"],
  rent: ["bike rental", "bike rentals"],
  festivals: ["festival", "festivals"],
  viewpoints: ["viewpoint", "viewpoints"],
  historical: ["historical place", "historical places"],
};

function ruPlural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

function countryRu(canon: string): string {
  return COUNTRIES.find((c) => c.canon === canon)?.ru ?? canon;
}

export function greeting(): string {
  return 'Yo, bro! Real Bro here. Point the bike — say "ride to Podgorica" — or ask "what bars are in Montenegro?" I drop the cards, you twist the throttle.';
}

export function rideReply(name: string, ru: boolean): string {
  return ru
    ? `Погнали, бро. Нашёл «${name}». Жми Go — пока думаешь, резина стынет.`
    : `Hell yeah. ${name} is locked in. Hit Go before you talk yourself back to the couch.`;
}

export function notFoundReply(query: string, ru: boolean): string {
  return ru
    ? `«${query}» нет ни в базе, ни на карте. Либо секретная точка, либо название прожевал. Давай ещё раз, bro.`
    : `No "${query}" in my base or on the map. Ghost town or you mumbled it. Try another name, bro.`;
}

export function unknownReply(ru: boolean): string {
  return ru
    ? "Бро, я не погода и не терапевт. Я Real Bro. Скажи «поехали в Подгорицу» — построю маршрут. Или «какие бары есть в Черногории» — кину карточки."
    : 'Easy, bro. I am Real Bro, not your weather app. Say "ride to Podgorica" to build a route, or "what bars are in Montenegro" and I drop the cards.';
}

/** Offline / API-down replies so greetings do not all collapse to the weather canned line. */
export function localChatReply(text: string): string {
  const t = text.toLowerCase().trim();
  if (/\b(ai|ии|chatgpt|gpt|бот|bot|robot|нейросет)/i.test(t)) {
    return "Yeah, bro — I am Real Bro, the in-app AI. Ask me where to ride or what bars are around, and I lock the cards.";
  }
  if (/weather|погод/i.test(t)) {
    return 'Weather? Not my lane. I build rides and drop place cards. Try "ride to Kotor" or "what hotels are in Montenegro".';
  }
  if (/^(hi|hey|hello|yo|sup|привет|здаров|здравств)\b/i.test(t) || t === "hello" || t === "hi") {
    return 'Yo. Real Bro online. Want a route — say "ride to Podgorica". Want places — "what bars are in Montenegro?"';
  }
  return unknownReply(false);
}

export function categoryReply(count: number, type: PlaceType, country: string | undefined, ru: boolean): string {
  if (ru) {
    const where = country ? ` в ${countryRu(country)}` : "";
    if (!count) return `Пока не нашёл таких мест${where}. Либо не та страна, либо единорогов ищешь.`;
    return `Держи ${count} ${ruPlural(count, CATEGORY_RU[type])}${where}. Карточка, Go — и не клади её в повороте.`;
  }
  const where = country ? ` in ${country}` : "";
  if (!count) return `No such places${where} yet. Wrong country or you are hunting unicorns. Try another shot.`;
  const [one, many] = CATEGORY_EN[type];
  return `Found ${count} ${count === 1 ? one : many}${where}. Pick a card, hit Go, try not to drop it.`;
}

export type GeoHit = { lat: number; lon: number; name: string };

/** Single Nominatim lookup used when the places base has no match. */
export async function geocodePlace(query: string): Promise<GeoHit | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
    const hit = rows?.[0];
    if (!hit) return null;
    const lat = Number.parseFloat(hit.lat);
    const lon = Number.parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const name = (hit.display_name || query).split(",").slice(0, 2).join(",").trim();
    return { lat, lon, name };
  } catch {
    return null;
  }
}

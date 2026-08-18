"""Build public/data snapshots from welcomebikers.eu CRM backups."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "_api"
OUT = ROOT / "public" / "data"
ORIGIN = "https://welcomebikers.eu"
BACKUP = f"{ORIGIN}/cr-system/scenario"

TYPE_MAP = {
    "hotel": "hotels",
    "restaurant": "restaurants",
    "restaurants": "restaurants",
    "bikers bar": "bars",
    "bikers bars": "bars",
    "historical place": "historical",
    "historical places": "historical",
    "moto shop": "shops",
    "moto shops": "shops",
    "service": "services",
    "services": "services",
    "view point": "viewpoints",
    "viewpoint": "viewpoints",
    "viewpoints": "viewpoints",
    "rent a bike": "rent",
    "festival": "festivals",
    "festivals": "festivals",
}

AMENITY_FLAGS = [
    ("wifi", "Wi-Fi"),
    ("parking", "Motorcycle Parking"),
    ("laundry", "Laundry"),
    ("sauna", "Sauna"),
    ("pool", "Pool"),
    ("motorcycle_clean", "Motorcycle wash"),
    ("food_always", "Food & Beverages 24/7"),
    ("card_payment", "Card payment"),
    ("food", "Food & Beverages"),
    ("gifts", "Gift for bikers"),
]

DAY_RE = re.compile(
    r"<details>\s*<summary>\s*<strong>(.*?)</strong>\s*</summary>(.*?)</details>",
    re.I | re.S,
)


def load_backup(name: str) -> list:
    path = API / f"{name}.json"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Download {BACKUP}/{name} first.")
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw.get("data") or []


def abs_url(path: str | None) -> str | None:
    if not path:
        return None
    value = str(path).strip()
    if not value:
        return None
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if not value.startswith("/"):
        value = "/" + value
    return ORIGIN + value


def on(value: object) -> bool:
    return str(value).strip().lower() in {"1", "yes", "true"}


def types_of(raw: str) -> list[str]:
    found: list[str] = []
    for part in (raw or "").split(","):
        key = part.strip().lower()
        mapped = TYPE_MAP.get(key)
        if mapped and mapped not in found:
            found.append(mapped)
    return found


def parse_coords(value: str) -> tuple[float, float] | None:
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", value or "")
    if not m:
        return None
    a, b = float(m.group(1)), float(m.group(2))
    # CRM stores lat,lon for places.
    if abs(a) <= 90 and abs(b) <= 180:
        return a, b
    if abs(b) <= 90 and abs(a) <= 180:
        return b, a
    return None


def strip_html(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html or "", flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def opening_hours(work_time: object) -> str | None:
    if not work_time:
        return None
    data = work_time
    if isinstance(work_time, str):
        try:
            data = json.loads(work_time)
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    if any(isinstance(v, dict) and v.get("is_24h") for v in data.values()):
        return "24/7"
    return None


def amenities_of(row: dict) -> list[str]:
    items: list[str] = []
    if on(row.get("bikers_frendly")):
        items.append("Bikers friendly")
    for key, label in AMENITY_FLAGS:
        raw = row.get(key)
        if key in {"gifts"}:
            if str(raw).strip() and str(raw).strip() not in {"0", "No"}:
                items.append(label)
            continue
        if on(raw):
            items.append(label)
    return items


def photos_of(row: dict, keys: tuple[str, ...] = ("photo1", "photo2", "photo3", "photo4", "photo5")) -> list[str]:
    out: list[str] = []
    for key in keys:
        url = abs_url(row.get(key))
        if url and url not in out:
            out.append(url)
    extra = row.get("photos")
    if extra:
        for part in str(extra).split(","):
            url = abs_url(part)
            if url and url not in out:
                out.append(url)
    return out


def clean_country(value: str, known: set[str]) -> str:
    text = (value or "").strip()
    if text in known:
        return text
    for name in known:
        if text.startswith(name):
            return name
    return re.split(r"[\n\r]", text)[0][:48]


def parse_route_days(html: str, dest: dict) -> tuple[list[dict], list[dict]]:
    waypoints = dest.get("waypoints") or []
    by_name = {w.get("name"): w for w in waypoints if isinstance(w, dict)}
    dest_days = dest.get("days") or []
    days: list[dict] = []
    for match in DAY_RE.finditer(html or ""):
        title = strip_html(match.group(1))
        body = strip_html(match.group(2))
        km = 0
        found = re.search(r"~?\s*(\d+)\s*km", body, re.I)
        if found:
            km = int(found.group(1))
        days.append(
            {
                "title": title or f"Day {len(days) + 1}",
                "distanceKm": km,
                "description": body,
                "points": [],
            }
        )
    for i, day in enumerate(days):
        cities = dest_days[i].get("cities") if i < len(dest_days) and isinstance(dest_days[i], dict) else []
        points = []
        for city in cities or []:
            wp = by_name.get(city)
            if not wp:
                continue
            coords = wp.get("coords") or []
            if len(coords) < 2:
                continue
            lng, lat = float(coords[0]), float(coords[1])
            points.append({"name": city, "lat": lat, "lon": lng})
        day["points"] = points
    all_points: list[dict] = []
    seen = set()
    for wp in waypoints:
        name = wp.get("name") or ""
        coords = wp.get("coords") or []
        if len(coords) < 2 or name in seen:
            continue
        seen.add(name)
        all_points.append({"name": name, "lat": float(coords[1]), "lon": float(coords[0])})
    dest_pt = dest.get("destination") or {}
    coords = dest_pt.get("coords") or []
    if len(coords) >= 2:
        name = dest_pt.get("name") or "Finish"
        if name not in seen:
            all_points.append({"name": name, "lat": float(coords[1]), "lon": float(coords[0])})
    return days, all_points


def dump(name: str, payload: object) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path.name} ({path.stat().st_size} bytes)")


def main() -> None:
    countries_raw = load_backup("backup_all_countries")
    known = {str(c.get("tilte") or c.get("title") or "").strip() for c in countries_raw}
    known.discard("")

    countries = [
        {
            "id": c.get("id"),
            "title": c.get("tilte") or c.get("title"),
            "iso": c.get("iso"),
            "flag": c.get("flag"),
            "filterFlag": abs_url(c.get("filters_flag")),
        }
        for c in countries_raw
        if c.get("tilte") or c.get("title")
    ]

    partners = load_backup("backup_all_partners")
    places = []
    skipped = 0
    for row in partners:
        if str(row.get("status")) != "1":
            skipped += 1
            continue
        mapped = types_of(row.get("type") or "")
        if not mapped:
            skipped += 1
            continue
        coords = parse_coords(row.get("coordinates") or "")
        if not coords:
            skipped += 1
            continue
        lat, lon = coords
        rating = None
        try:
            if row.get("google_rating"):
                rating = round(float(row["google_rating"]), 1)
        except ValueError:
            rating = None
        reviews = 0
        try:
            reviews = int(str(row.get("google_reviews") or "0").split(".")[0] or 0)
        except ValueError:
            reviews = 0
        desc = (row.get("description") or "").strip()
        places.append(
            {
                "id": row["id"],
                "name": row.get("name") or "Untitled",
                "types": mapped,
                "country": clean_country(row.get("country") or "", known),
                "city": row.get("city") or "",
                "lat": lat,
                "lon": lon,
                "rating": rating,
                "reviews": reviews,
                "video": row.get("video") or None,
                "bikersFriendly": on(row.get("bikers_frendly")),
                "address": row.get("address") or ", ".join(filter(None, [row.get("city"), row.get("country")])),
                "description": desc if desc else None,
                "phone": row.get("phone") or None,
                "website": row.get("social") or None,
                "email": row.get("email") or None,
                "photos": photos_of(row),
                "openingHours": opening_hours(row.get("work_time") or ""),
                "amenities": amenities_of(row),
                "status": "published",
            }
        )

    routes = []
    for row in load_backup("backup_best_routes"):
        dest_raw = row.get("destination") or {}
        if isinstance(dest_raw, str):
            try:
                dest = json.loads(dest_raw)
            except json.JSONDecodeError:
                dest = {}
        else:
            dest = dest_raw
        days, points = parse_route_days(row.get("description") or "", dest if isinstance(dest, dict) else {})
        if not points:
            continue
        hours = row.get("total_hours")
        try:
            hours_n = int(str(hours).split(".")[0]) if hours else None
        except ValueError:
            hours_n = None
        country = clean_country(row.get("country") or "", known)
        days_count = row.get("days") or str(len(days) or 1)
        subtitle = f"{days_count} days"
        if hours_n:
            subtitle += f" · {hours_n} h"
        subtitle += f" · {country}"
        routes.append(
            {
                "id": row["id"],
                "title": row.get("Name") or "Route",
                "subtitle": subtitle,
                "country": country,
                "days": days
                or [
                    {
                        "title": "Day 1",
                        "distanceKm": 0,
                        "description": strip_html(row.get("description") or ""),
                        "points": points[:2],
                    }
                ],
                "image": abs_url(row.get("image_route")) or "",
                "gpxUrl": abs_url(row.get("gpx")),
                "points": points,
            }
        )

    reviews = []
    for row in load_backup("backup_all_rates"):
        if str(row.get("status")) not in {"1", "true", "True"}:
            continue
        try:
            rating = int(float(row.get("rating") or 0))
        except ValueError:
            rating = 0
        try:
            created = int(str(row.get("time") or "0").split(".")[0] or 0)
        except ValueError:
            created = 0
        reviews.append(
            {
                "id": row["id"],
                "placeId": row.get("id_object"),
                "userId": row.get("id_user") or "",
                "name": row.get("name_user") or "Rider",
                "rating": max(1, min(5, rating or 1)),
                "text": (row.get("review") or "").strip(),
                "createdAt": created,
                "photo": abs_url(row.get("photo_user")),
            }
        )

    rooms = []
    for row in load_backup("backup_hotel_rooms"):
        rooms.append(
            {
                "id": row["id"],
                "hotelId": row.get("hotel_id"),
                "name": row.get("category_name") or row.get("type") or "Room",
                "type": row.get("type"),
                "bed": row.get("bed"),
                "guests": row.get("guests"),
                "square": row.get("square"),
                "facilities": [x.strip() for x in str(row.get("facilities") or "").split(",") if x.strip()],
                "photos": photos_of(row),
            }
        )

    dump("countries.json", countries)
    dump("objects.json", places)
    dump("routes.json", routes)
    dump("reviews.json", reviews)
    dump("hotel-rooms.json", rooms)
    print(f"places={len(places)} skipped={skipped} routes={len(routes)} reviews={len(reviews)} rooms={len(rooms)}")


if __name__ == "__main__":
    sys.exit(main())

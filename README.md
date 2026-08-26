# Welcome Bikers

Welcome Bikers is a motorcycle travel application for discovering rider-friendly places, planning multi-stop routes, and following turn-by-turn navigation in a browser or Android app.

## Main capabilities

- Place catalogue for hotels, shops, bars, restaurants, services, rentals, events, viewpoints, and historical sites.
- Route planning with Google Directions, Valhalla, and OSRM fallbacks.
- Google Maps and MapLibre rendering behind a shared map interface.
- GPS filtering, route snapping, rerouting, navigation camera, voice instructions, and route progress.
- Installable PWA and Capacitor Android package.
- Real Bro assistant with text, speech-to-text, and text-to-speech through a server-side OpenRouter proxy.

## Technology

- React 19, TypeScript, Vite
- MapLibre GL, Google Maps JavaScript API, Leaflet
- Capacitor 8 for Android
- Playwright for browser and navigation tests
- Node or Cloudflare Worker OpenRouter proxy
- Workbox service worker through `vite-plugin-pwa`

## Local development

Requirements:

- Node.js 22+
- npm

```bash
npm ci
copy .env.example .env.local
npm run dev
```

The development server is available at `http://localhost:5173`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser-restricted Google Maps key. MapLibre is used when absent. |
| `VITE_OPENROUTER_PROXY_URL` | Stable public base URL of the OpenRouter proxy. |
| `VITE_OPENROUTER_DISCOVERY_URL` | Optional URL of a JSON document containing `{ "base": "https://proxy.example" }`. |
| `OPENROUTER_API_KEY` | Server-side key used only by the proxy. Never expose it through a `VITE_` variable. |
| `ALLOWED_ORIGINS` | Comma-separated web origins accepted by the proxy. |
| `PUBLIC_APP_URL` | Public application URL sent as the OpenRouter referer. |
| `PROXY_RATE_LIMIT` | Per-IP, per-endpoint requests per minute. Default: `40`. |
| `UPSTREAM_TIMEOUT_MS` | Proxy upstream timeout. Default: `45000`. |
| `TRUST_PROXY` | Trust a load balancer-provided client IP only when set to `true`. Default: `false`. |

## Commands

```bash
npm run dev          # local Vite server
npm run build        # production web build
npm run preview      # preview production build
npm run typecheck    # strict TypeScript check
npm run test:proxy   # proxy policy tests
npm run test:e2e     # Playwright suite against an existing build
npm test             # proxy tests, production build, and Playwright
npm run android:sync # build and copy web assets into Android
npm run android:apk  # build a debug APK
```

## Docker

The repository contains two independent containers:

- `Dockerfile`: builds and serves the static PWA with unprivileged Nginx.
- `Dockerfile.proxy`: runs the OpenRouter proxy without embedding its API key.

```bash
copy .env.example .env
docker compose up --build
```

The web app is exposed on `http://localhost:8080`; the proxy is exposed on `http://localhost:8787`.

## Data and accounts

Catalogue snapshots are loaded from `public/data`. Profiles, favourites, chat messages, reviews, booking drafts, SOS notes, and place submissions are stored only in the browser or WebView local storage.

These local flows are previews. They do not contact a hotel, moderator, emergency service, or another rider. A production backend is required before presenting them as networked services.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY.md)
- [Operations and deployment](docs/OPERATIONS.md)
- [Testing](docs/TESTING.md)

## Current boundaries

- A network connection is required for new map tiles, routing, and Real Bro provider calls.
- Provider-specific route limitations are displayed in the route sheet.
- Google and OSM-derived maps must retain their visible attribution.
- Browser-side credentials are suitable only for a local preview, not production identity or authorization.

# Architecture

## System context

Welcome Bikers is a client-heavy application distributed as a PWA and a Capacitor Android package. The application does not currently have a general-purpose backend. Static catalogue snapshots are bundled with the web build, user-created preview data is stored locally, and Real Bro provider calls pass through a small server-side proxy.

```text
Browser PWA / Android WebView
        |
        +-- React application
        |     +-- catalogue and local profile data
        |     +-- route planning and navigation state
        |     +-- WbMap map-engine facade
        |     +-- Real Bro user interface
        |
        +-- map and routing providers
        |     +-- Google Maps / Google Directions
        |     +-- MapLibre / OpenFreeMap / raster fallbacks
        |     +-- Valhalla / OSRM
        |
        +-- OpenRouter proxy
              +-- chat
              +-- speech
              +-- transcription
```

## Source layout

```text
src/
  components/       Reusable interface and navigation components
  pages/            Route-level React screens
  lib/
    wbmap*.ts        Shared map facade and engine implementations
    routing-*.ts     Route domain types
    groute.ts        Google Directions adapter
    osrm.ts          Route-provider orchestration and OSM adapters
    nav*.ts          Navigation progress, camera, rerouting, and voice logic
    gps.ts           GPS acceptance and smoothing
    location.ts      Browser and Capacitor geolocation
    assistant.ts     Local Real Bro intent parsing and responses
    openrouter.ts    Real Bro provider client
    stt.ts / tts.ts  Voice provider clients
    store.ts         Local preview persistence
    data.ts          Static snapshot loading and enrichment
public/data/         Catalogue, routes, rooms, reviews, chat, and SOS snapshots
workers/             Node and Cloudflare OpenRouter proxy adapters
e2e/                 Playwright browser and navigation tests
android/             Capacitor Android project
```

## Application shell

`src/main.tsx` starts the native shell when running under Capacitor, registers the PWA service worker in browsers, and mounts the React router. `src/App.tsx` declares route-level screens. The map page is loaded lazily because map engines are the largest part of the application.

Hash routing is used so the static build can run without server-side route rewriting. The small hash guard in `main.tsx` prevents Google Maps from replacing the application route.

## Map subsystem

`WbMap` is the public map interface. It queues calls while an engine loads and tries Google Maps before MapLibre. Both engines implement:

- place and route-stop markers;
- route alternatives and selected route;
- route progress;
- traffic visibility;
- map theme and satellite mode;
- browse and navigation puck rendering;
- navigation camera follow, heading, zoom, and recenter behavior.

Provider attribution is part of the rendered map and must remain visible.

The two engine files contain provider-specific camera and rendering code. Shared behavior belongs in `wbmap-types.ts`, `nav-camera.ts`, or another engine-neutral module. New feature code should not import a concrete engine directly.

## Routing

The route domain is defined by `DriveRoute` in `routing-types.ts`. All providers return the same geometry, duration, distance, steps, traffic flag, profile, and limitation fields.

Planning order:

1. Scenic routes prefer Valhalla motorcycle routing.
2. Google Directions is attempted when a configured key is available.
3. Valhalla is used for motorcycle preferences.
4. OSRM provides a basic fallback.

OSRM cannot enforce toll, ferry, paved-road, or motorcycle profile preferences. The adapter therefore marks those limitations instead of claiming that the switches were applied.

The map page owns the selected stops and route choice. Each planning request has a generation key. A changed stop or option immediately invalidates GO until the matching request finishes, preventing navigation from starting with a stale route.

## Navigation

Navigation uses the following pipeline:

1. `location.ts` provides browser or Capacitor fixes.
2. `gps.ts` rejects inaccurate fixes and impossible jumps.
3. `navTrackingTarget` determines whether to snap the rider to the route.
4. `remainingAlong` calculates route progress with a bounded previous-segment window.
5. `updateReroute` applies distance, accuracy, hold-time, and cooldown rules.
6. Each map engine renders the rider and camera target.
7. `voice.ts` decides when to announce the next maneuver.

Navigation does not substitute the route origin for missing GPS. The HUD displays a waiting state until a current fix is accepted. Exit controls remain available if route data is lost.

## Real Bro

Real Bro combines local intent parsing with an OpenRouter-backed response:

- known ride and category intents can be answered from local catalogue data;
- free-form prompts use the `/chat` proxy endpoint;
- mobile voice recording uses `/transcribe`;
- neural voice uses `/speech` and falls back to browser speech.

The browser never receives the OpenRouter API key. Closing or unmounting Real Bro aborts pending provider calls, microphone sessions, and speech playback.

## Persistence

`store.ts` uses one versioned local-storage document. It contains the current local profile, password verifier, favourites, messages, reviews, booking drafts, SOS notes, and pending places.

Passwords are derived with PBKDF2 and a random salt. This removes plaintext storage and password-bypass defects, but local browser storage is not a production authentication system. Authorization and cross-device data require a backend.

## PWA and offline behavior

The application shell and map-engine chunks are precached. Static data uses network-first runtime caching. External map tiles and new route calculations still require network access unless already cached by the browser.

Service-worker updates wait while GO navigation is active to avoid reloading during a ride.

## Architectural invariants

- Provider secrets never enter the web bundle.
- A route can start only when its result matches the current stops and options.
- GPS absence is represented explicitly; route coordinates are never presented as a live fix.
- Provider limitations are shown instead of silently ignored.
- Map attribution remains visible.
- Local-only actions must be labelled as local-only.
- Both map engines implement the complete `WbMap` contract.
- Long-running network requests have deadlines and late results are ignored.

## Recommended next boundary

The next major architectural step is a backend for identity, moderation, chat, bookings, reviews, and SOS delivery. When that exists, split `store.ts` into local preferences and remote repositories, and keep pages dependent on repository interfaces rather than transport details.

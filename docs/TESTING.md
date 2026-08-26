# Testing

## Test layers

### TypeScript

```bash
npm run typecheck
```

The application source uses strict TypeScript, unused-symbol checks, and switch fallthrough checks.

### Proxy policy

```bash
npm run test:proxy
```

The Node test suite verifies origin configuration, exact endpoint matching, model and token restrictions, unsupported audio payload rejection, and request-rate limits.

### Browser and navigation

```bash
npm run build
npm run test:e2e
```

Playwright covers:

- Real Bro local and provider-backed intent handling;
- mobile recording and transcription retries;
- TTS and microphone exclusion;
- map engine fallback;
- route preview and multi-stop markers;
- GO camera, HUD, exit, and GPS-start behavior;
- offline PWA shell;
- mobile safe-area layout;
- navigation math, GPS filtering, reroute hysteresis, progress, maneuver previews, and voice timing.

### Complete local verification

```bash
npm test
```

This runs proxy tests, a production build, and all Playwright tests. Live OpenRouter tests are skipped unless their explicit environment flag and provider key are supplied.

## Required regression cases

Changes to navigation must preserve:

- GO is disabled as soon as stops or route options change.
- A late route result cannot replace a newer route request.
- Missing GPS displays a waiting state and never moves the rider to the route origin.
- Exit remains available if route data is lost.
- Route progress does not jump to a nearby later segment at a loop.
- Location watches stop when navigation exits during asynchronous setup.
- Google and MapLibre retain equivalent route-stop and navigation behavior.

Changes to Real Bro must preserve:

- closing the panel aborts pending chat, speech, and recording work;
- unmounting releases every microphone track;
- delayed speech cannot start while recording;
- expired proxy discovery retries once;
- user-visible fallback remains available when the provider is unavailable.

Changes to local profile or data flows must preserve:

- profile edits do not erase password verifiers;
- a passwordless record never authenticates;
- existing plaintext records migrate only after a correct password;
- booking dates are future and ordered;
- local-only actions are not described as remote success.

## CI gate

Production deployment must depend on:

1. dependency installation from the lockfile;
2. TypeScript;
3. proxy policy tests;
4. production build;
5. Playwright.

Provider-dependent live tests should run separately so provider outages do not hide deterministic regressions. Their failure still requires investigation before a release that changes Real Bro provider behavior.

## Physical-device checks

Browser automation cannot fully reproduce:

- iOS microphone permission and audio-session behavior;
- Android WebView permission transitions;
- real GPS noise, tunnels, and parallel roads;
- background/foreground location watch behavior;
- compass calibration;
- thermal and battery effects during a long ride.

Before a mobile release, test at least one current iPhone and one current Android device using a route with a loop, a deliberate off-route section, loss of network, denied location, and two consecutive Real Bro voice recordings.

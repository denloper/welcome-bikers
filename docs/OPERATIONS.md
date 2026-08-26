# Operations and deployment

## Deployment units

Welcome Bikers has two deployable units:

1. A static PWA built from `Dockerfile` or `npm run build`.
2. A Node proxy built from `Dockerfile.proxy`.

The proxy must run on a stable HTTPS service. Scheduled temporary tunnels are not suitable for production because URL rotation creates predictable outages and stale clients.

## Local Docker environment

Create `.env` from `.env.example` and set `OPENROUTER_API_KEY`.

```bash
docker compose up --build
```

Endpoints:

- PWA: `http://localhost:8080`
- proxy health: `http://localhost:8787/health`

The browser accesses the proxy through `VITE_OPENROUTER_PROXY_URL`, which defaults to `http://localhost:8787`. For a remote deployment, this value must be the public HTTPS proxy address available to end users, not an internal container hostname.

## Platform-neutral web deployment

Any static host can publish `dist`:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Upload the resulting `dist` directory with:

- `index.html` configured as the fallback document;
- HTTPS enabled;
- immutable caching for hashed `/assets/*`;
- no-cache or short caching for `index.html`, `sw.js`, and `or-proxy.json`;
- correct MIME types for JavaScript workers and the PWA manifest.

Build-time values:

```text
VITE_GOOGLE_MAPS_API_KEY=https-referrer-restricted-browser-key
VITE_OPENROUTER_PROXY_URL=https://proxy.example.com
```

`VITE_OPENROUTER_DISCOVERY_URL` is optional. Prefer a stable proxy URL. If discovery is used, host the JSON on infrastructure that can be updated independently and set short cache headers.

## Proxy deployment

The Node container listens on `PORT`, default `8787`.

Required:

```text
OPENROUTER_API_KEY
ALLOWED_ORIGINS=https://app.example.com,capacitor://localhost
PUBLIC_APP_URL=https://app.example.com
```

Recommended:

```text
PROXY_RATE_LIMIT=40
UPSTREAM_TIMEOUT_MS=45000
TRUST_PROXY=false
```

Keep `TRUST_PROXY=false` when the Node service is directly reachable. Set it to `true` only when a trusted load balancer overwrites `X-Forwarded-For`; otherwise clients can forge rate-limit identities.

Expose `/health` to the platform health checker. Keep the service private behind the platform load balancer and terminate TLS at the edge.

The Cloudflare Worker adapter in `workers/openrouter-proxy/src/index.js` uses the same request policy. Configure `OPENROUTER_API_KEY` as a Worker secret and the other values as environment variables.

## Moving away from GitHub services

The application runtime no longer requires GitHub proxy discovery. Migration can be performed without changing application code:

1. Mirror or import the repository into the chosen source host.
2. Deploy the proxy container to a stable non-Russian provider.
3. Configure the app build with the new proxy URL.
4. Deploy `dist` or the web container to the selected static/container host.
5. Verify PWA installation, route planning, Real Bro chat, speech, and transcription.
6. Build and sign Android artifacts in the replacement CI or locally.
7. Update DNS and allowed origins.
8. Keep the old site during a short rollback window.
9. Disable old workflows, Pages, tunnel jobs, and release distribution only after cutover succeeds.

Do not remove the working deployment before the replacement passes the test and rollback checklist.

## Android

Debug package:

```bash
npm run android:apk
```

The output is created under `android/app/build/outputs/apk/debug`.

For release distribution:

- provide a private signing keystore outside the repository;
- use a release-only signing configuration;
- verify `webContentsDebuggingEnabled` and mixed content remain disabled;
- set the final application hostname and deep-link configuration;
- test microphone, geolocation, background/foreground transitions, and map fallback on physical devices.

## Health and monitoring

Monitor at minimum:

- proxy `/health` availability;
- OpenRouter response status and latency by endpoint;
- HTTP 429 rate-limit counts;
- provider spending and quota;
- route-provider failure rate;
- JavaScript errors during GO navigation;
- service-worker update and offline failures.

Do not include request bodies, audio data, precise GPS tracks, or credentials in normal logs.

## Release procedure

1. Pull the intended revision into a clean workspace.
2. Install dependencies with `npm ci`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Build both containers.
6. Deploy the proxy and verify `/health`.
7. Deploy the web application with the final proxy URL.
8. Smoke-test browse map, route preview, GO entry/exit, Real Bro, and local-data notices.
9. Roll out Android only after web and proxy checks pass.

## Rollback

Keep the previous web image and proxy image address. A rollback changes both units together when their request contract changed. Restore the previous images, confirm `/health`, reload the PWA, and verify the active service worker version.

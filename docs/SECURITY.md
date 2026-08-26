# Security model

## Scope

The current application is a public client and local-data preview. It does not provide server-backed identity or authorization. The only privileged service is the OpenRouter proxy.

## Secrets

`OPENROUTER_API_KEY` is server-only. It must be provided to the proxy process through the hosting platform secret store or container environment. It must never use a `VITE_` prefix, appear in a Docker build argument, or be committed to the repository.

`VITE_GOOGLE_MAPS_API_KEY` is a browser key and is visible to users by design. Protect it in Google Cloud with:

- exact production HTTP referrers;
- the Android application ID and signing-certificate fingerprint when used natively;
- an API allowlist containing only required Maps APIs;
- quota and billing alerts.

Rotate the previous key if its historical restrictions are unknown.

## OpenRouter proxy

The proxy implements:

- an explicit origin allowlist;
- exact endpoint matching;
- JSON-only request bodies;
- endpoint-specific body-size limits;
- approved model allowlists;
- message, token, text, speed, and format limits;
- per-IP, per-endpoint request limits;
- upstream timeouts;
- redacted client-facing errors.

Browser CORS headers are not authentication because non-browser clients can forge an `Origin` header. In-memory rate limits are also best-effort and reset with each process or Worker isolate.

For public production traffic, place the proxy behind a durable API gateway or edge firewall with persistent rate limiting, bot controls, spending limits, and monitoring. If the application later gains real user accounts, issue short-lived server-signed proxy tokens after authentication.

## Local profiles

Local profile passwords are stored as PBKDF2-SHA-256 verifiers with random salts. Existing plaintext records are migrated after the first successful login.

This protects against casual inspection but does not turn local storage into secure authentication. Any script running on the same origin can access the local profile and data. Do not use this profile to authorize payments, moderation, private messages, emergency actions, or personal records.

## Local user data

The following remain on the device:

- profile and password verifier;
- favourites;
- chat preview messages;
- reviews;
- booking drafts;
- SOS notes;
- place submissions.

The interface labels these flows as local. Before adding a backend, define retention, deletion, consent, access control, abuse handling, and data-processing responsibilities.

## Maps and attribution

Google, OpenStreetMap-derived tiles, MapLibre, Carto, Esri, and other providers have attribution and usage terms. Do not hide provider logos, copyright controls, or attribution text. Review tile-provider terms before commercial distribution.

## Android

The production Capacitor configuration:

- disables mixed HTTP content;
- disables WebView debugging;
- prevents automatic JavaScript windows;
- disables third-party cookies;
- keeps geolocation and media access limited to application use.

Release APK or AAB files must be signed outside the repository. Do not commit keystores, passwords, service-account files, or generated signing configuration.

## Reporting and response

If a provider key is exposed or abused:

1. disable or rotate the provider key;
2. stop the affected proxy deployment;
3. inspect provider usage and billing;
4. identify the exposed route and request pattern;
5. add or tighten gateway controls;
6. redeploy and verify health, rate limits, and model restrictions.

Do not log raw voice recordings, passwords, authorization headers, or complete Real Bro conversations by default.

## Production checklist

- Stable HTTPS app and proxy domains are configured.
- Proxy origin allowlist contains only real app origins.
- Persistent edge rate limiting and spending alerts are enabled.
- Browser Maps key restrictions are verified.
- Full tests gate deployment.
- Provider attribution is visible in every map mode.
- A privacy notice describes local and remote processing.
- Server-backed features have authentication and authorization.
- Android release debugging and mixed content remain disabled.
- Backups and rollback procedures are tested.

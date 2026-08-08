# P4 Staging Runtime Configuration Audit

## Scope and evidence

This is the pre-change implementation audit captured on 2026-07-28. It is based on `backend/app.js`, `backend/server.js`, `backend/config/index.js`, `backend/config/auth.config.js`, `backend/config/email.config.js`, `backend/config/payment.config.js`, `backend/config/db.js`, `backend/middleware/csrf.js`, the payment provider registry configuration, both browser API clients, and the three Next.js/ESLint/TypeScript configurations. No real environment file or private P3 configuration was read.

## Current implementation before P4 changes

### Runtime and environment loading

- `backend/server.js` loads dotenv before importing the database connector and Express app, then connects to MongoDB before opening the HTTP listener.
- `backend/app.js` does not itself load dotenv. It can be imported without opening a port; the pre-change smoke recorded zero `listen` calls.
- `backend/config/index.js` separately loads dotenv and exposes `NODE_ENV`, port, MongoDB, JWT, cookie and CORS values, but the active `app.js` CORS block does not consume its `cors` object.
- There is no single active startup validator for environment, origin, proxy, cookie, email and provider decisions.
- `APP_ENV=staging` is documented by P3, but the active origin/cookie code does not interpret it.

### Origin and CORS handling

- Active CORS is an inline array in `backend/app.js`.
- The storefront entry is `FRONTEND_URL` with a development fallback.
- `ADMIN_URL` from `backend/config/index.js` is not used by the active CORS block.
- A second localhost origin and two deployment origins are hard-coded.
- CORS credentials are enabled, allowed methods/headers are explicit, and `app.options('*', cors(corsOptions))` handles preflight.
- There is no origin normalization, malformed-URL rejection, embedded-credential rejection, wildcard-with-credentials guard, or staging/production required-origin gate.
- Exact array comparison performed by the `cors` package is safer than substring matching, but committed hard-coded deployment origins create environment ambiguity.
- Requests without an `Origin` header are accepted, which is necessary for server-to-server and same-origin/non-browser clients.

### CSRF

- `backend/middleware/csrf.js` implements signed double-submit tokens using an HMAC and timing-safe equality.
- CSRF protection is attached to refresh, logout, logout-all, session revocation and change-password routes.
- The middleware verifies only the signed cookie/header pair. It does not validate `Origin` against the CORS allowlist.
- Consequently CORS and CSRF do not currently share a reviewed trusted-origin source.

### Authentication cookies

- The refresh cookie is HttpOnly, path `/api`, and has an explicit max age.
- The CSRF cookie is intentionally browser-readable, path `/`, and has the same max age.
- Both cookies are Secure only when `NODE_ENV === 'production'`.
- `AUTH_COOKIE_SAME_SITE` is validated against `strict`, `lax`, and `none`; the current default is `lax` outside production and `none` in production.
- There is no guard that requires an explicit staging/production SameSite decision, and no explicit `SameSite=None`/Secure invariant.
- No cookie domain is configured, so both cookies are host-only. That is the safest default, but it does not by itself determine whether a future multi-host deployment is same-site or cross-site.
- Browser clients use `withCredentials: true`; access and CSRF tokens are maintained in module/store memory. The pre-change storage scan found 11 browser-storage calls, all for recent searches, recently viewed items, or wishlist data; sensitive-token/payment storage findings were zero.

### Proxy and HTTPS awareness

- The Express app does not set `trust proxy`; Express therefore uses its default `false`.
- There is no validated proxy-hop decision, backend public-origin variable, or startup check that an internet-accessible staging/production backend origin is HTTPS.
- Secure cookies are selected from `NODE_ENV`, not from an explicit deployable-environment and HTTPS contract.
- The repository says staging storefront, admin and backend origins are distinct, but it does not establish whether they share one registrable site. It is therefore insufficient evidence to choose `SameSite=Lax/Strict` versus `SameSite=None` automatically.

### Health, email and payment providers

- `/api/health` is unauthenticated and returns a simple service state plus a coarse Mongoose connection state. It does not expose configuration secrets.
- Email configuration accepts SMTP environment variables, but `EmailService` remains a mock implementation; there is no staging SMTP startup gate.
- Payment edition is restricted by the provider registry to `pakistan`, `international`, or `full`, with a fallback.
- COD, bank transfer and Raast currently default enabled; Stripe, JazzCash and Easypaisa default disabled. P3 separately requires external providers to remain disabled.
- Provider configuration is resolved only when the payment subsystem needs it. P4 must not activate or invoke a provider and does not change provider business rules.

### Frontend/admin and quality configuration

- Storefront and admin API clients default to loopback and enable credentialed requests.
- Storefront Next config has `ignoreBuildErrors: false`.
- Admin Next config has `ignoreBuildErrors: true` and an unsupported `eslint.ignoreDuringBuilds` property hidden by `@ts-ignore`. Baseline builds therefore pass while explicitly skipping type validation.
- Both TypeScript configs already have `skipLibCheck: true`; P4 did not introduce it and will not use it to hide first-party errors.
- The repository contains both `frontend/next.config.ts` and `frontend/next.config.js`, creating configuration ambiguity. Next.js 16.2.10 selected the TypeScript configuration in the observed builds.

## Environment-specific assessment

| Concern | Development | Automated test | Staging | Production |
|---|---|---|---|---|
| Storefront origin | Localhost fallback | Inherits local behavior | Not required; only `FRONTEND_URL` is dynamic | Not required; hard-coded deployment origin remains |
| Admin origin | Hard-coded localhost plus deployment origin | Same inline list | `ADMIN_URL` ignored | `ADMIN_URL` ignored |
| Additional origins | Hard-coded only | Hard-coded only | No environment list | No environment list |
| Origin validation | Array equality only | Array equality only | No startup validation | No startup validation |
| CSRF origin | Not checked | Not checked | Not checked | Not checked |
| Refresh/CSRF Secure | false | false | Depends on `NODE_ENV`; `APP_ENV` ignored | true |
| SameSite | defaults `lax` | defaults `lax` | Depends on `NODE_ENV`; may default `none` | defaults `none` |
| Proxy trust | false | false | No explicit decision | No explicit decision |
| HTTPS public URL | Not validated | Not validated | Not validated | Not validated |
| Missing config behavior | Permissive defaults | Permissive defaults | Does not fail closed | Does not fail closed for origins/proxy |

## Required minimal change

P4 should introduce one side-effect-free runtime configuration module that:

1. derives `development`, `test`, `staging`, or `production` from sanitized environment names;
2. validates and normalizes exact HTTP(S) origins;
3. permits only explicit localhost defaults in development/test;
4. requires storefront, admin, backend public origin, proxy decision and SameSite decision in staging/production;
5. requires HTTPS origins and Secure cookies in staging/production;
6. rejects wildcard origins, URL credentials, paths, queries and fragments;
7. supplies the same allowlist to CORS and CSRF;
8. makes the Express proxy decision explicit;
9. reports only variable names/reasons on validation failure; and
10. performs no network or provider operation.

The module must not guess deployment site topology. Staging/production must explicitly select `AUTH_COOKIE_SAME_SITE`; documentation will explain that `none` is only appropriate for genuinely cross-site HTTPS clients, while `lax`/`strict` require a compatible same-site topology. Cookie domain remains host-only unless a separate deployment design is approved.

## Pre-change runtime evidence

- App import listener calls: 0.
- Loopback health: HTTP 200.
- Raw webhook loopback smoke: HTTP 200 and request body verified as `Buffer`.
- Atlas/database access during this audit: 0.
- Provider invocations during this audit: 0.
- Retired payment endpoint source matches: 0.
- Active first-party source hard-secret findings: 0 across 459 scanned source/config files.
- Existing unresolved relative imports: six, all unchanged legacy/inactive findings documented in the P3 report.

## Implemented P4 resolution

The minimal implementation now centralizes deployable runtime decisions in
`backend/config/runtime.config.js`.

- `FRONTEND_URL`, `ADMIN_URL`, `BACKEND_PUBLIC_URL` and optional
  `TRUSTED_ORIGINS` are normalized as exact origins.
- Staging and production require explicit HTTPS storefront, admin and backend
  origins, explicit `AUTH_COOKIE_SECURE`, explicit
  `AUTH_COOKIE_SAME_SITE`, and an explicit `TRUST_PROXY` decision.
- Wildcards, malformed URLs, embedded credentials, paths, queries, fragments,
  non-HTTP(S) protocols and non-loopback HTTP origins are rejected.
- The same allowlist function is used by CORS and CSRF.
- Secure/HttpOnly/path cookie behavior comes from the reviewed runtime
  configuration; cookies remain host-only.
- Broad `trust proxy=true` is rejected; deployed environments accept only
  `false` or an explicit hop count from 1 through 10.
- Development and test retain only the established loopback defaults.
- No WebSocket or SSE origin handler was added because the active application
  has no such transport.
- No deployment topology was guessed: staging/production must explicitly
  choose SameSite according to the approved same-site or cross-site topology.

Focused local tests cover these decisions without a database, external
network, Atlas, or payment-provider call. Final evidence is recorded in
`docs/P4_STAGING_DEPLOYMENT_READINESS_REPORT.md`.

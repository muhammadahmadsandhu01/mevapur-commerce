# P5A Component Runtime Profile

## Evidence boundary

The profiles use committed package scripts, installed framework metadata, and active source/configuration only. No real environment file or private configuration was read.

Local verification used Node `v24.18.0` and npm `11.16.0`; these versions describe the verification host and are not a repository runtime pin. The installed Next.js 16.2.10 packages declare Node `>=20.9.0`. The backend repository declares no minimum Node version.

## 1. Backend API

| Field | Repository-supported profile |
|---|---|
| Framework/runtime | Node.js CommonJS application; Express 5.2.1; Mongoose 9.1.6 |
| Node version | **Not pinned by the repository.** Owner/platform decision required. |
| Install | `npm ci` in `backend` |
| Build | None defined |
| Start | `npm run start` → `node server.js` |
| Port | `PORT`; fallback 5000 in `backend/server.js` |
| Liveness | `GET /api/health` |
| Readiness | No trustworthy readiness endpoint. Current health response is HTTP 200 even when MongoDB is not connected. |
| State classification | Partially stateful operationally: application data/sessions are external in MongoDB, but logs are written locally and rate limits are process-local. |
| Writable filesystem | Required by both active logger implementations. `/uploads` is served but an active upload writer was not verified. |
| Build-time variables | None; there is no build step. |
| Mandatory runtime variables | `APP_ENV`, `NODE_ENV`, `PORT`, `MONGODB_URI`, `FRONTEND_URL`, `ADMIN_URL`, `BACKEND_PUBLIC_URL`, `TRUSTED_ORIGINS`, `AUTH_COOKIE_SAME_SITE`, `AUTH_COOKIE_SECURE`, `TRUST_PROXY`, `JWT_SECRET`, `CSRF_SECRET` |
| Auth/session runtime variables | `JWT_ACCESS_EXPIRE`, `JWT_REFRESH_EXPIRE`, `JWT_ISSUER`, `JWT_AUDIENCE`, `REFRESH_COOKIE_NAME`, `CSRF_COOKIE_NAME`, `AUTH_MAX_LOGIN_ATTEMPTS`, `AUTH_LOCKOUT_DURATION`, `AUTH_RESET_TOKEN_EXPIRY`, `AUTH_AUTO_VERIFY_EMAIL` |
| Payment runtime variables | `PAYMENT_EDITION`; `PAYMENT_PROVIDER_COD_ENABLED`; `PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED`; `PAYMENT_PROVIDER_RAAST_ENABLED`; `PAYMENT_PROVIDER_JAZZCASH_ENABLED`; `PAYMENT_PROVIDER_EASYPAISA_ENABLED`; `PAYMENT_PROVIDER_STRIPE_ENABLED`; local/manual public metadata variables only when those methods are approved |
| External-provider secrets | Must be absent for initial staging. This includes Stripe and unapproved provider credentials/secrets. |
| Email variables | Current implementation is mock/logging oriented. There is no active explicit `EMAIL_MODE` contract; this is a documented source/configuration gap. SMTP names exist in configuration but must not be supplied or invoked initially. |
| Outbound network | Required: DNS/TCP to the approved isolated staging MongoDB service. Optional but disabled initially: payment providers, SMTP/email, analytics. |
| Inbound origins | Exact storefront and admin origins; backend origin also participates in runtime validation. No wildcard. |
| Scaling/session implications | Refresh sessions are in MongoDB and access tokens are stateless, but rate limiting is per process and local log files are per replica. |
| Graceful shutdown | `server.js` closes the HTTP server on `SIGTERM`/`SIGINT`; `config/db.js` also registers signal handlers and calls `process.exit`. Coordination is ambiguous and must be tested/remediated before multi-replica production use. |
| Logs | Two Winston implementations write files. Development adds console output; production stdout behavior is not a complete platform logging contract. Database connection errors include raw `error.message`. |
| Deployment blockers | Platform/runtime selection; exact proxy count; real origin approvals; secret-store mapping; database identity gate; readiness/fail-fast gap; local logging/redaction; duplicate shutdown handlers; broad static CSP review. |

`STAGING_BACKEND_ORIGIN` is supported only as a compatibility input in runtime configuration; `BACKEND_PUBLIC_URL` is the canonical P5 name.

## 2. Storefront

| Field | Repository-supported profile |
|---|---|
| Framework/runtime | Next.js 16.2.10, React 19.2.4, TypeScript |
| Node version | Next dependency requires Node `>=20.9.0`; project has no explicit pin. |
| Install | `npm ci` in `frontend` |
| Build | `npm run build` → `next build` |
| Start | `npm run start` → `next start` |
| Port | Next CLI/platform `PORT`; otherwise framework default 3000 |
| Liveness | `/` can provide shallow page liveness |
| Readiness | No dedicated health/readiness route |
| State classification | Application state is browser/API based; server build is replaceable. Image optimizer/cache can use ephemeral writable storage. |
| Writable filesystem | Build output must be readable. Framework cache/image optimization may write to ephemeral storage. No durable application file storage was found. |
| Build-time variables | `NEXT_PUBLIC_API_URL`; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` exists in code but must be omitted while Stripe is disabled. No active public edition/provider-display variable is implemented. |
| Runtime variables | With the current client bundle, `NEXT_PUBLIC_*` values are compiled at build time. A platform runtime change requires a rebuild unless the platform performs build at deploy time. |
| Outbound network | Build-time Google font retrieval. Runtime server image optimization may retrieve images only from configured remote patterns. Browser must call the approved backend origin. |
| Inbound origins | Approved public storefront origin only; backend CORS/CSRF must list it exactly. |
| Scaling/session implications | Authentication access token is browser-memory only; refresh cookie is host-only on the backend origin. Storefront replicas do not own sessions. |
| Graceful shutdown | Provided by Next.js runtime/platform; no application-specific signal handler exists. |
| Logs | Framework stdout/stderr; no repository-defined retention or redaction policy. |
| Deployment blockers | Platform choice; public URL; Node pin; artifact mode; Google font build access/self-hosting decision; duplicate Next config; remote image allowlist review; no dedicated health endpoint. |

The frontend build has three verified edition-compatible modes, but no active `NEXT_PUBLIC_*` edition variable exists. Edition selection currently maps to backend `PAYMENT_EDITION` and the build verification procedure, not to an invented storefront variable.

## 3. Admin panel

| Field | Repository-supported profile |
|---|---|
| Framework/runtime | Next.js 16.2.10, React 19.2.4, TypeScript |
| Node version | Next dependency requires Node `>=20.9.0`; project has no explicit pin. |
| Install | `npm ci` in `admin-panel` |
| Build | `npm run build` → `next build` |
| Start | `npm run start` → `next start` |
| Port | Next CLI/platform `PORT`; otherwise framework default 3000 |
| Liveness | `/` can provide shallow page liveness |
| Readiness | No dedicated health/readiness route |
| State classification | Replaceable application process; authentication/session state is in browser memory/backend MongoDB. |
| Writable filesystem | Build output must be readable; ordinary framework temporary/cache space may be ephemeral. No durable admin file storage was found. |
| Build-time variables | `NEXT_PUBLIC_API_URL` |
| Runtime variables | Current public URL is compiled into the client build. No active public edition/provider-display variables are implemented. |
| Outbound network | Browser must call the approved backend origin. No required external font/provider request was found in the admin source. |
| Inbound origins | Approved public admin origin only; backend CORS/CSRF must list it exactly. |
| Scaling/session implications | Admin access token is memory-only; refresh cookie remains host-only at the backend. Admin replicas do not own sessions. |
| Graceful shutdown | Provided by Next.js runtime/platform; no application-specific signal handler exists. |
| Logs | Framework stdout/stderr; no repository-defined retention or redaction policy. |
| Deployment blockers | Platform choice; public URL; Node pin; artifact mode; no dedicated health endpoint; monitoring/log policy. |

## Shared runtime decisions

1. Use three separately addressable services/processes. The two Next applications cannot both rely on port 3000 on the same host namespace.
2. Use HTTPS and `AUTH_COOKIE_SECURE=true`.
3. Use exact origins and an exact platform-documented `TRUST_PROXY` hop count.
4. Keep externally networked payment providers and external email disabled for initial staging.
5. Supply only the isolated staging application database identity through an approved secret store.
6. Decide whether to use `next start` or a validated standalone artifact; do not mix packaging instructions.
7. Add/approve a separate source-remediation milestone for backend readiness, logging/redaction, shutdown coordination, duplicate Next config, and health endpoints before deployment traffic is accepted.


# P5C Exact Pre-Change Baseline

## Gate result

**PASS**

The baseline was captured after the P5C recovery checkpoint and before P5C
application-source implementation. Real environment files were blocked during
Next builds. No current deployment, Atlas/deployed database, AI provider,
payment provider, email provider, analytics, geolocation, or external
application API was used.

## Backend

| Gate | Exact result |
|---|---|
| Complete backend suite | PASS, exit 0, 24/24 suites, 185/185 tests |
| P0 Authentication | PASS, exit 0, 5/5 suites, 23/23 tests |
| P1 Order | PASS, exit 0, 5/5 suites, 59/59 tests |
| P2 Payment | PASS, exit 0, 4/4 suites, 32/32 tests |
| P2.2 Providers | PASS, exit 0, 4/4 suites, 35/35 tests |
| P4 configuration | PASS, exit 0, 2/2 suites, 26/26 tests |
| P5B operations | PASS, exit 0, 6/6 suites, 26/26 tests |
| First-party JavaScript syntax | PASS, 183 checked, 0 failed |
| Error-code references | PASS, 83 definitions, 89 references, 35 unique references, 0 unresolved |
| Relative references | 353 checked, six unchanged inactive findings |
| App import | PASS, zero listener calls during import |
| Liveness | PASS, `/api/health` returned HTTP 200 and compatible `status: OK` |
| Readiness without database | PASS, `/api/ready` returned HTTP 503 with sanitized response |
| Raw webhook | PASS, HTTP 200 and controller boundary received a `Buffer` |
| Retired storefront payment endpoints | PASS, 0 matches |
| Browser storage | 120 source files, 10 calls, 0 sensitive persistence matches |
| Sanitized high-confidence secret scan | PASS, 469 source/diff/evidence files, 0 matches |

The six relative-reference findings remain inactive legacy debt:

1. `backend/database/seeders/index.js` -> `../../common/logger`
2. `backend/database/seeders/roleSeeder.js` -> `../../common/logger`
3. `backend/middleware/authorize.js` -> `../errors/AppError`
4. `backend/middleware/rateLimiter.js` -> `../config/security.config`
5. `backend/middleware/rateLimiter.js` -> `../errors/AppError`
6. `backend/middleware/securityHeaders.js` -> `../config/security.config`

Expected negative-path request logs and the pre-existing duplicate Mongoose
`slug` index warnings were visible and were not suppressed.

### Diagnostic-harness retry

The first standalone app-import diagnostic exited 1 because it intentionally
did not read `backend/.env`, while the authentication configuration correctly
failed closed without `JWT_SECRET`. The diagnostic was rerun with process-local
synthetic test-only JWT/CSRF values. It then exited 0 and verified:

- app import listener calls: 0;
- liveness status: 200;
- compatible health contract: true;
- readiness without a database: 503;
- webhook status: 200; and
- webhook body was a `Buffer`: true.

No real environment file was read during either attempt.

## Storefront

| Gate | Result |
|---|---|
| TypeScript | PASS, exit 0 |
| ESLint | PASS, exit 0, 0 errors, 32 warnings |
| Pakistan build | PASS, exit 0, 17 generated route/page units |
| International build | PASS, exit 0, 17 generated route/page units |
| Full build | PASS, exit 0, 17 generated route/page units |
| Health route | Present as dynamic `/healthz` |

Each restricted storefront build first failed only because the existing
`next/font` Inter import could not fetch its Google font CSS through restricted
network execution. Each required build was rerun with network access limited to
that existing build-time font request and passed. No backend, database,
provider, deployed application, analytics, or geolocation request was made.

## Admin panel

| Gate | Result |
|---|---|
| TypeScript | PASS, exit 0 |
| ESLint | PASS, exit 0, 0 errors, 101 warnings |
| Pakistan build | PASS, exit 0, 26 generated routes |
| International build | PASS, exit 0, 26 generated routes |
| Full build | PASS, exit 0, 26 generated routes |
| Health route | Present as dynamic `/healthz` |

The existing `experimental.serverMinification` caution was reported and not
suppressed.

## Isolation and environment evidence

- Jest global setup rejected inherited `MONGODB_URI`.
- Database-backed tests used loopback-only MongoDB Memory Server.
- Successful Next builds used synthetic public build values.
- A temporary preload guard made real `.env*` files appear absent and rejected
  direct reads.
- The temporary guard was created outside the project and removed after builds.
- Build-generated `frontend/next-env.d.ts` content was restored to the verified
  pre-change backup value.
- `C:\MevaPur-Private\p3-staging.env` was not read.
- No real environment file was read or modified.
- No Atlas, staging, production, or deployed database was contacted.
- No current Vercel or Render deployment was contacted.
- No external AI/payment/email provider was contacted.

## Local runtime evidence

- Node: `v24.18.0`
- npm: `11.16.0`

These observations are not a customer deployment runtime selection.


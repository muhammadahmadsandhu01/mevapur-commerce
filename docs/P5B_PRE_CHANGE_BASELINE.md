# P5B Exact Pre-Change Baseline

## Gate result

**PASS**

The baseline was captured after the P5B recovery checkpoint and before any P5B
source implementation change. Real environment files were blocked during the
successful Next builds. No Atlas, deployed application, payment provider, email
provider, migration, seed, or external application API was used.

## Backend

| Gate | Exact result |
|---|---|
| Complete backend suite | PASS, exit 0, 18/18 suites, 155/155 tests |
| P0 Authentication | PASS, exit 0, 5/5 suites, 23/23 tests |
| P1 Order | PASS, exit 0, 5/5 suites, 59/59 tests |
| P2 Payment | PASS, exit 0, 4/4 suites, 32/32 tests |
| P2.2 Providers | PASS, exit 0, 4/4 suites, 35/35 tests |
| P4 configuration | PASS, exit 0, 2/2 suites, 22/22 tests |
| First-party JavaScript syntax | PASS, 174 checked, 0 failed |
| Error-code references | PASS, 83 definitions, 89 references, 35 unique references, 0 unresolved |
| Relative references | 334 checked, six unchanged inactive findings |
| App import | PASS, zero listener calls during import |
| Liveness | PASS, `/api/health` returned HTTP 200 and the compatible `status: OK` contract |
| Raw webhook | PASS, HTTP 200 and controller boundary received a `Buffer` |
| Retired storefront endpoints | PASS, 0 matches |
| Browser storage | 10 calls, 0 token/payment/idempotency/session storage matches |
| Sanitized high-confidence secret scan | PASS, 400 text/evidence files scanned, 0 matches |

The six relative-reference findings remain:

1. `backend/database/seeders/index.js` -> `../../common/logger`
2. `backend/database/seeders/roleSeeder.js` -> `../../common/logger`
3. `backend/middleware/authorize.js` -> `../errors/AppError`
4. `backend/middleware/rateLimiter.js` -> `../config/security.config`
5. `backend/middleware/rateLimiter.js` -> `../errors/AppError`
6. `backend/middleware/securityHeaders.js` -> `../config/security.config`

Expected negative-path request logs and the pre-existing duplicate Mongoose
`slug` index warnings were visible and were not hidden.

### Diagnostic harness retry

The first combined health/webhook diagnostic exited 1 because it instrumented
`http.Server.listen` while Supertest was making two in-process requests.
Supertest's two temporary listeners were therefore misclassified as app-import
listeners. The corrected diagnostic restored the listener method immediately
after importing `app.js`, then performed the requests. It exited 0 with:

- import listener calls: 0;
- liveness status: 200;
- compatible health contract: true;
- webhook status: 200;
- webhook body was a Buffer: true.

This was a diagnostic-harness defect, not an application failure.

## Storefront

| Gate | Result |
|---|---|
| TypeScript | PASS, exit 0 |
| ESLint | PASS, exit 0, 0 errors, 32 warnings |
| Pakistan build | PASS, exit 0, 16 generated page units |
| International build | PASS, exit 0, 16 generated page units |
| Full build | PASS, exit 0, 16 generated page units |

The first build command exited 1 before Next started because the temporary
environment guard path contained an unquoted space in `NODE_OPTIONS`. The guard
was then loaded through its verified Windows short path. The next sandboxed
build exited 1 because the existing `next/font` Inter import could not reach
Google Fonts from the restricted network. The required build was rerun with
network access only for that existing font asset and passed. The other two
edition builds passed under the same guard. No backend, provider, database, or
email request was made.

## Admin panel

| Gate | Result |
|---|---|
| TypeScript | PASS, exit 0 |
| ESLint | PASS, exit 0, 0 errors, 101 warnings |
| Pakistan build | PASS, exit 0, 25 generated routes |
| International build | PASS, exit 0, 25 generated routes |
| Full build | PASS, exit 0, 25 generated routes |

All successful admin builds used the environment-file guard. The existing
`experimental.serverMinification` caution was reported by Next and was not
suppressed.

## Isolation and environment evidence

- Jest global setup rejected inherited `MONGODB_URI`.
- All database-backed tests used the loopback-only MongoDB Memory Server.
- Successful Next builds used only synthetic public build values.
- Reads of `.env`, `.env.local`, and other `.env*` files were blocked by the
  temporary preload guard.
- The temporary preload guard was removed after the builds.
- `C:\MevaPur-Private\p3-staging.env` was not read.
- No real environment file was read or modified.
- No Atlas, staging, or production database was contacted.
- No provider or email service was contacted.

## Local runtime evidence

- Node: `v24.18.0`
- npm: `11.16.0`

These are observations only and are not an owner-approved deployment pin.


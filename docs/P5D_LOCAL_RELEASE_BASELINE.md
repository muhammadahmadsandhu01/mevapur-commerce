# P5D Local Release Baseline

## Gate result

**PASS**

The complete P5C-authoritative local release regression passed before any
platform access. Database-backed tests used loopback-only MongoDB Memory
Server. No repository real environment file, private P3 configuration, Atlas
database, deployed application, or external provider was used.

## Backend

| Gate | Exact result |
|---|---|
| Complete backend suite | PASS, exit 0, 30/30 suites, 227/227 tests |
| P0 Authentication | PASS, exit 0, 5/5 suites, 23/23 tests |
| P1 Order | PASS, exit 0, 5/5 suites, 59/59 tests |
| P2 Payment | PASS, exit 0, 4/4 suites, 32/32 tests |
| P2.2 Providers | PASS, exit 0, 4/4 suites, 35/35 tests |
| P4 configuration | PASS, exit 0, 2/2 suites, 26/26 tests |
| P5B operations | PASS, exit 0, 6/6 suites, 26/26 tests |
| P5C assistant/portability | PASS, exit 0, 6/6 suites, 42/42 tests |
| First-party JavaScript syntax | PASS, 210 checked, 0 failed |
| Error-code references | PASS, 83 definitions, 85 dot references, 35 unique references, 0 unresolved |
| Relative imports | 389 checked; 6 known inactive findings; 0 active unresolved |
| Express app import | PASS, exports an app and opened 0 listeners |
| Liveness | PASS, `/api/health` returned 200 with compatible contract |
| Readiness without database | PASS, `/api/ready` returned sanitized 503 |
| Raw payment webhook | PASS, 200 and controller boundary received a `Buffer` |
| Raw webhook order | PASS, webhook router remains before `express.json()` |
| Retired browser endpoints | PASS, 0 matches |
| Browser storage | 10 calls, 0 sensitive token/payment/idempotency matches |

The six relative-import findings are the unchanged inactive legacy paths:

1. `backend/database/seeders/index.js` -> `../../common/logger`
2. `backend/database/seeders/roleSeeder.js` -> `../../common/logger`
3. `backend/middleware/authorize.js` -> `../errors/AppError`
4. `backend/middleware/rateLimiter.js` -> `../config/security.config`
5. `backend/middleware/rateLimiter.js` -> `../errors/AppError`
6. `backend/middleware/securityHeaders.js` -> `../config/security.config`

Expected negative-path request logs and the existing duplicate Mongoose `slug`
index warnings were captured and not suppressed.

## Storefront

| Gate | Exact result |
|---|---|
| TypeScript | PASS, exit 0 |
| ESLint | PASS, exit 0, 0 errors, 32 warnings |
| Pakistan build | PASS, exit 0, 19 application units |
| International build | PASS, exit 0, 19 application units |
| Full build | PASS, exit 0, 19 application units |
| Canonical contract | PASS in all three builds |
| Demo noindex metadata | PASS in all three builds |
| Robots | PASS, disallows all in all three builds |
| Sitemap | PASS, contains no public URL entries in all three builds |
| Help Assistant | PASS, client bundle present and retrieval label contract resolves to `Help Search` |
| Client static secret scan | PASS, 30 files per build, 0 high-confidence matches |

## Admin panel

| Gate | Exact result |
|---|---|
| TypeScript | PASS, exit 0 |
| ESLint | PASS, exit 0, 0 errors, 101 warnings |
| Pakistan build | PASS, exit 0, 27 application routes |
| International build | PASS, exit 0, 27 application routes |
| Full build | PASS, exit 0, 27 application routes |
| Robots/noindex contract | PASS in all three builds |
| Read-only Admin Help Assistant | PASS in all three client bundles |
| Client static secret scan | PASS, 43 files per build, 0 high-confidence matches |

The existing Next warning about `experimental.serverMinification` was retained
and not hidden.

## Isolation and environment evidence

- The Jest bootstrap rejected inherited database variables.
- Every database-backed suite created a loopback-only MongoDB Memory Server
  replica set.
- Real `.env*` reads were blocked by a temporary preload guard outside the
  project.
- Builds used only synthetic `.test` public origins.
- The required `PAYMENT_EDITION` values were set per build.
- Storefront indexing remained false.
- No real environment file or private P3 file was read.
- No Atlas, production, staging, or deployed database was contacted.
- No Vercel, Render, payment, AI, email, analytics, or geolocation request was
  made.
- The guarded builds made no external font or application request.
- Preserved `next-env.d.ts`/TypeScript build-information files were restored
  to their exact pre-run hashes; all four preservation checks passed.

## Transparent harness corrections

The application gates were not weakened:

1. The first background backend wrapper treated an expected native stderr
   warning as a terminating PowerShell error. It produced no Jest verdict.
   The wrapper was corrected to decide by process exit code; the complete and
   all focused suites then passed.
2. The first static helper had two `Array.map(path.resolve)` callback-signature
   errors before application checks. Explicit callbacks were applied; the
   complete static gate then passed.
3. The first Next runner attempts stopped on preload-path quoting, empty-log
   parsing, and a reserved PowerShell variable name in the post-build parser.
   The affected application commands either did not start or exited 0; all
   required gates were rerun end-to-end with the corrected external runner and
   passed.

No project source, package, lock, model, index, migration, or test was changed
to obtain these results.


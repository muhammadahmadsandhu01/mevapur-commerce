# P5A Isolated Staging Deployment Decision Gate Report

## 1. Exact status

**P5A ISOLATED STAGING DEPLOYMENT DECISION GATE PASSED — DEPLOYMENT NOT EXECUTED; OWNER APPROVALS PENDING**

This status means the sanitized decision package is complete. It does **not** authorize P5 deployment. All owner selections remain pending, no hosting platform was selected, and the identified source/operational blockers must be handled before deployment traffic.

## 2. Recovery checkpoint

- Gate: PASS
- Authoritative backup: `C:\MevaPur-Backups\mevaPur-post-p4-pre-p5a-20260728-123028`
- Robocopy exit code: 1 (successful copy with files copied)
- Stable comparison: 544 source files / 544 backup files
- Bytes: 461,378,485 / 461,378,485
- Missing: 0
- Extra: 0
- SHA-256 mismatches: 0
- Private environment files copied: no
- Git branch/commit/status metadata recorded separately: yes
- High-confidence pre-change evidence secret matches: 0

The first unique attempt at `C:\MevaPur-Backups\mevaPur-post-p4-pre-p5a-20260728-122715` is retained as **INCOMPLETE — NOT AUTHORITATIVE**. Its copy completed, but hashing a transient Codex `.git` checkpoint failed when that volatile reference disappeared. It was not overwritten, deleted, or reused. The authoritative retry excluded volatile `.git` internals and recorded stable Git identity separately.

See `docs/P5A_RECOVERY_CHECKPOINT.md`.

## 3. Deployment artifact inventory

Present and active:

- separate npm package/lock files for backend, storefront, and admin;
- backend `node server.js` start contract;
- Next.js `next build` / `next start` contracts;
- Next standalone output configuration;
- backend liveness endpoint;
- static public assets;
- local backend file logging;
- storefront Google font build dependency and remote image optimization.

Present but inactive/legacy/ambiguous:

- Laravel-oriented backend environment example, not the Node deployment contract;
- duplicate storefront Next configuration;
- third-party Docker artifacts only in excluded dependency/vendor content;
- `/uploads` static route without a verified active upload writer;
- two backend logger implementations;
- standalone output without a selected standalone launch/package strategy.

Absent:

- authoritative hosting-platform configuration;
- first-party Docker/Docker Compose/Procfile;
- Vercel/Render/Railway/Fly/Netlify application manifest;
- GitHub Actions/CI/CD;
- process manager;
- reverse proxy;
- runtime version pin;
- storefront/admin dedicated health endpoints;
- backend database-gated readiness endpoint;
- background worker/cron;
- WebSocket/SSE service;
- active Redis deployment contract.

Repository evidence does not identify a hosting platform. P5A does not guess one.

See `docs/P5A_DEPLOYMENT_ARTIFACT_INVENTORY.md`.

## 4. Component runtime profiles

| Component | Install | Build | Start | Port | Health/readiness | Principal blocker |
|---|---|---|---|---|---|---|
| Backend API | `npm ci` | None | `npm run start` → `node server.js` | `PORT`, fallback 5000 | `/api/health` is liveness only; not DB readiness | Runtime/platform/proxy/database identity, local logging, fail-fast/readiness, shutdown coordination |
| Storefront | `npm ci` | `npm run build` | `npm run start` → `next start` | Platform `PORT`, otherwise Next default 3000 | `/` shallow liveness; no dedicated readiness | Platform/artifact mode, Node pin, origin, font/image network, duplicate config |
| Admin | `npm ci` | `npm run build` | `npm run start` → `next start` | Platform `PORT`, otherwise Next default 3000 | `/` shallow liveness; no dedicated readiness | Platform/artifact mode, Node pin, origin, health/monitoring |

The project has no Node version pin. Installed Next 16.2.10 declares Node `>=20.9.0`; backend minimum is not declared. Local verification used Node `v24.18.0` and npm `11.16.0`, which are evidence, not the deployment contract.

See `docs/P5A_COMPONENT_RUNTIME_PROFILE.md`.

## 5. Supported topology options

- A: fixed storefront/admin/API subdomains under one registrable staging parent;
- B: frontend/admin and backend on unrelated registrable domains;
- C: platform-generated temporary domains.

Every option is cross-origin and therefore needs exact CORS. Option A is schemefully same-site under HTTPS and avoids the third-party-cookie risk of B/C.

**RECOMMENDATION — OWNER APPROVAL REQUIRED:** Option A with three fixed HTTPS subdomains, host-only cookies, Secure enabled, an approved `lax` SameSite decision, exact CORS/CSRF origins, previews disabled, and an exact platform-documented proxy-hop count.

No topology was selected.

See `docs/P5A_STAGING_TOPOLOGY_DECISION.md`.

## 6. Unresolved owner decisions

All 30 decisions are PENDING:

1. P5A-D001 backend hosting platform;
2. P5A-D002 storefront hosting platform;
3. P5A-D003 admin hosting platform;
4. P5A-D004 storefront staging URL;
5. P5A-D005 admin staging URL;
6. P5A-D006 backend staging URL;
7. P5A-D007 same-site/cross-site topology;
8. P5A-D008 `AUTH_COOKIE_SAME_SITE`;
9. P5A-D009 host-only cookie sufficiency;
10. P5A-D010 `TRUST_PROXY` hop count;
11. P5A-D011 DNS owner/provider;
12. P5A-D012 TLS/certificate management;
13. P5A-D013 secret-store platform;
14. P5A-D014 database application-user injection method;
15. P5A-D015 reuse/reverification of the existing staging app DB user;
16. P5A-D016 migration user disabled/removed confirmation;
17. P5A-D017 synthetic customer account policy;
18. P5A-D018 synthetic admin account policy;
19. P5A-D019 outbound email mode;
20. P5A-D020 log retention/redaction;
21. P5A-D021 monitoring/alert destination;
22. P5A-D022 rollback owner;
23. P5A-D023 deployment approval owner;
24. P5A-D024 payment edition;
25. P5A-D025 disabled-provider/manual-method policy;
26. P5A-D026 preview deployment policy;
27. P5A-D027 search indexing block;
28. P5A-D028 Node version and Next artifact mode;
29. P5A-D029 focused pre-deployment source-remediation gate;
30. P5A-D030 filesystem/log/upload policy.

See `docs/P5A_OWNER_DECISION_REGISTER.md` for allowed options, security implications, repository constraints, recommendations, and PENDING approval fields.

## 7. Required environment variable names

### Backend mandatory/deployment-gated

- `NODE_ENV`
- `APP_ENV`
- `PORT` when platform-supplied
- `MONGODB_URI`
- `FRONTEND_URL`
- `ADMIN_URL`
- `BACKEND_PUBLIC_URL`
- `TRUSTED_ORIGINS` when additional origins are approved
- `AUTH_COOKIE_SAME_SITE`
- `AUTH_COOKIE_SECURE`
- `TRUST_PROXY`
- `JWT_SECRET`
- `CSRF_SECRET`
- `PAYMENT_EDITION`
- `PAYMENT_PROVIDER_COD_ENABLED`
- `PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED`
- `PAYMENT_PROVIDER_RAAST_ENABLED`
- `PAYMENT_PROVIDER_STRIPE_ENABLED`
- `PAYMENT_PROVIDER_JAZZCASH_ENABLED`
- `PAYMENT_PROVIDER_EASYPAISA_ENABLED`
- `JAZZCASH_OFFICIAL_CONTRACT_APPROVED`
- `EASYPAISA_OFFICIAL_CONTRACT_APPROVED`

### Backend optional/explicit policy

- `JWT_ACCESS_EXPIRE`
- `JWT_REFRESH_EXPIRE`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `REFRESH_COOKIE_NAME`
- `CSRF_COOKIE_NAME`
- `LOG_LEVEL`
- public manual-payment metadata names only if the corresponding method is approved

### Storefront

- `NEXT_PUBLIC_API_URL` — mandatory build-time public value
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — must be absent initially

### Admin

- `NEXT_PUBLIC_API_URL` — mandatory build-time public value

No active public edition or provider-display flag variable is implemented in either browser application. P5A does not invent one. No active explicit email-mode or readiness variable exists; these are documented source/configuration gaps.

## 8. Public-versus-secret classification

Secrets, backend runtime only:

- `MONGODB_URI`
- `JWT_SECRET`
- `CSRF_SECRET`
- any future provider/server credential or webhook secret
- any future SMTP identity/password

Public policy/configuration:

- origins;
- cookie/proxy policy;
- token lifetimes/issuer/audience;
- payment edition and enabled flags;
- public manual-payment display metadata;
- log level.

Browser-public build values:

- `NEXT_PUBLIC_API_URL`;
- only a future approved Stripe publishable key, never a secret.

Final scan found zero backend secret-name exposure through `NEXT_PUBLIC_*`.

See `docs/P5A_ENVIRONMENT_INJECTION_PLAN.md`.

## 9. DNS, TLS, and network prerequisites

- fixed DNS names and record types chosen from platform evidence;
- managed TLS/renewal and HTTPS redirect;
- explicit HSTS decision;
- IPv4/IPv6 paths tested independently;
- no wildcard preview/admin exposure;
- exact proxy chain and hop count;
- exact health-check sources where allowlisting applies;
- isolated staging egress identity or private networking;
- no unrestricted Atlas allowlist;
- platform DNS support for the approved URI mode, including SRV/TXT if used;
- DNS TTL and previous targets captured for rollback;
- no production network/project/cluster identity.

See `docs/P5A_DNS_TLS_NETWORK_PLAN.md`.

## 10. Database application-identity injection

- Backend alone receives `MONGODB_URI` from an approved secret reference.
- Staging application identity is least-privilege and staging-cluster/database scoped.
- Migration credentials and production credentials are forbidden.
- Temporary migration user must be confirmed disabled/removed.
- Operator runs an exact, read-only staging marker identity gate before traffic.
- Only sanitized pass/fail facts are recorded.
- Current pool behavior is 5 minimum / 20 maximum connections per backend process with a 10-second server-selection timeout.
- Current liveness/fail-fast/logging/shutdown gaps require a pre-deployment operator/source gate.

P5A did not read the P3 private file and did not connect to Atlas.

See `docs/P5A_DATABASE_IDENTITY_INJECTION_PLAN.md`.

## 11. Provider, email, and external-network policy

- Stripe/JazzCash/Easypaisa disabled.
- Their credentials, webhook secrets, merchant credentials, and Stripe browser key absent.
- No initial sandbox/live provider request.
- Email disabled or local/mock capture; SMTP absent.
- Analytics/marketing/geolocation integrations disabled/unapproved.
- No production API dependency.
- COD/bank/Raast are local/manual and remain disabled unless the owner approves a specific synthetic smoke.
- Required future runtime egress is limited to isolated staging database and approved monitoring/log transport.
- Storefront browser egress is limited to the approved backend and reviewed static/image origins.

The required local storefront builds fetched the configured Google Inter font after the restricted build could not reach it. This was build-time font access only—not an application endpoint, Atlas, payment provider, email, deployment, analytics, or production service call.

See `docs/P5A_EXTERNAL_SERVICE_POLICY.md`.

## 12. Non-executable deployment sequence

The plan contains 19 controlled steps:

1. approvals;
2. recovery verification;
3. operator-created platform projects;
4. variable-name mapping;
5. secret-store injection;
6. disabled-provider verification;
7. database app identity;
8. dark backend deploy;
9. liveness/readiness;
10. marker identity;
11. storefront deploy;
12. admin deploy;
13. DNS/TLS;
14. CORS/CSRF/cookies;
15. synthetic browser smoke;
16. exact cleanup;
17. monitoring/redaction;
18. keep-active approval;
19. exact rollback references.

No executable platform command is supplied because no platform is approved.

## 13. Rollback and hard stops

Hard stops include production identity, marker mismatch, CORS wildcard, CSRF mismatch, insecure/wrong-site cookies, wrong proxy count, secret exposure, provider activation/call, health/readiness failure, route/build mismatch, cleanup failure, uncontrolled preview, TLS/DNS error, or missing rollback target.

Rollback routes each component to its previous immutable staging release, restores only approved staging configuration, rechecks identity/security, and cleans only exact synthetic IDs. It never performs a database drop, broad deletion, production restore, or migration operation.

See `docs/P5A_DEPLOYMENT_AND_ROLLBACK_PLAN.md`.

## 14. Browser smoke plan

Designed but not executed:

- storefront/admin load and HTTPS;
- Secure/HttpOnly/host-only/SameSite cookies;
- login, refresh rotation, logout;
- accepted/rejected CORS and CSRF origins;
- synthetic registration and product read;
- conditional COD/bank/Raast local flows;
- customer self-review rejection and authorized admin review;
- disabled Stripe/JazzCash/Easypaisa rejection;
- historical provider metadata read;
- health plus independent readiness;
- raw webhook Buffer boundary without provider call;
- exact cleanup and post-cleanup marker verification.

Each check is assigned to browser automation, direct HTTP, operator confirmation, database aggregate confirmation, or a combination.

See `docs/P5A_BROWSER_SMOKE_PLAN.md`.

## 15. Focused local regression

| Gate | Command/result | Exit |
|---|---|---:|
| Backend complete | `npm.cmd test -- --runInBand --watchAll=false`: 18/18 suites, 155/155 tests | 0 |
| P4 configuration | `npx.cmd jest tests/unit/config/runtime.config.test.js tests/unit/middleware/csrf-origin.test.js --runInBand --watchAll=false`: 2/2 suites, 22/22 tests | 0 |
| Checkout/routing contract | `npx.cmd jest tests/unit/contracts/checkout-order.contract.test.js --runInBand --watchAll=false`: 1/1 suite, 7/7 tests | 0 |
| Storefront TypeScript | `npx.cmd tsc --noEmit --incremental false --pretty false` | 0 |
| Storefront lint | 0 errors, 32 unchanged warnings | 0 |
| Storefront Pakistan build | PASS, TypeScript PASS, 16 page units | 0 |
| Storefront international build | PASS, TypeScript PASS, 16 page units | 0 |
| Storefront full build | PASS, TypeScript PASS, 16 page units | 0 |
| Admin TypeScript | `npx.cmd tsc --noEmit --incremental false --pretty false` | 0 |
| Admin lint | 0 errors, 101 unchanged warnings | 0 |
| Admin Pakistan build | PASS, TypeScript PASS, 25 routes | 0 |
| Admin international build | PASS, TypeScript PASS, 25 routes | 0 |
| Admin full build | PASS, TypeScript PASS, 25 routes | 0 |
| App import/no listener | Contract/config tests PASS; `app.js` contains 0 `.listen(` calls | 0 |
| Raw webhook ordering | Mount precedes JSON parser; route contains `express.raw`; contract test PASS | 0 |
| Retired frontend endpoints | 0 matches; contract test PASS | 0 |
| Sensitive browser storage | 0 token/payment/idempotency storage matches | 0 |
| Source/diff secret scan | 451 files; 0 high-confidence matches | 0 |

Test database enforcement rejects an inherited database URI and accepts only a loopback MongoDB Memory Server URI. No Atlas/database service was contacted.

### Non-hidden execution notes

- The first backend invocation using PowerShell's `npm` shim was blocked by the host execution policy before tests started. Re-running the same script via `npm.cmd` passed.
- An initial temporary-copy build experiment failed because Turbopack rejects a `node_modules` junction outside its project root. No source changed; the temporary scratch was safely removed.
- The first restricted storefront Pakistan build failed only because the configured Google font was unreachable. The build-only network retry passed, followed by the other two passing storefront builds.
- Every successful Next build used a temporary Node preload guard that made every `.env*` file unavailable to the build process. Approved sanitized process variables were used instead. The temporary guard was removed afterward.
- Admin build output continues to display the pre-existing experimental `serverMinification` caveat; TypeScript and all three builds passed.
- Existing duplicate Mongoose slug-index warnings and expected negative-path test logs were not hidden or changed.

## 16. Scope and file integrity

Final sealed comparison against the authoritative manifest:

- baseline files: 544;
- current stable files: 556;
- missing baseline files: 0;
- changed baseline files: 0;
- added after backup: 12, all P5A documents;
- unexpected added first-party files: 0;
- required P5A files present: 14/14;
- high-confidence secret matches: 0;
- unsanitized network literals in P5A decision documents: 0;
- pre-existing tracked deletions preserved: 3.

The final report is the twelfth post-backup P5A document; the pre-change status and patch are already in the backup manifest. The final seal passed with 0 baseline changes and 0 unexpected additions.

Required builds refreshed ignored/generated `.next` output and tests emitted ignored/generated logs. These are not first-party source, package, lock, environment, schema, migration, or deployment configuration changes.

## 17. Exact project files created

1. `docs/P5A_PRE_CHANGE_GIT_STATUS.txt`
2. `docs/P5A_PRE_CHANGE_WORKING_TREE.patch`
3. `docs/P5A_RECOVERY_CHECKPOINT.md`
4. `docs/P5A_DEPLOYMENT_ARTIFACT_INVENTORY.md`
5. `docs/P5A_COMPONENT_RUNTIME_PROFILE.md`
6. `docs/P5A_STAGING_TOPOLOGY_DECISION.md`
7. `docs/P5A_OWNER_DECISION_REGISTER.md`
8. `docs/P5A_ENVIRONMENT_INJECTION_PLAN.md`
9. `docs/P5A_DNS_TLS_NETWORK_PLAN.md`
10. `docs/P5A_DATABASE_IDENTITY_INJECTION_PLAN.md`
11. `docs/P5A_EXTERNAL_SERVICE_POLICY.md`
12. `docs/P5A_DEPLOYMENT_AND_ROLLBACK_PLAN.md`
13. `docs/P5A_BROWSER_SMOKE_PLAN.md`
14. `docs/P5A_DECISION_GATE_REPORT.md`

## 18. Exact existing project files changed

**None.**

The two pre-change evidence files were new when captured; the remaining P5A files are new documents. No pre-existing first-party stable file hash changed.

## 19. Safety confirmations

- Application source modified: **NO**
- Package manifest modified: **NO**
- Lock file modified: **NO**
- Real environment file read: **NO**
- Real environment file modified: **NO**
- P3 private configuration read: **NO**
- Atlas accessed: **NO**
- Staging/production MongoDB accessed: **NO**
- Loopback MongoDB Memory Server used for tests: **YES**
- Deployment executed: **NO**
- Cloud/platform project created: **NO**
- DNS record changed: **NO**
- TLS certificate issued/changed: **NO**
- Secret-store entry created/changed: **NO**
- Payment provider invoked: **NO**
- Email provider invoked: **NO**
- Production application/API invoked: **NO**
- Existing project file deleted: **NO**
- Existing project file moved/renamed/archived: **NO**
- Three pre-existing tracked deletions preserved: **YES**
- Order/Payment/provider business contracts changed: **NO**
- Raw payment webhook ordering preserved: **YES**

## 20. Exact decisions required before P5 execution

P5 requires approved values for P5A-D001 through P5A-D030, plus completion of every dependency they identify. Most importantly:

- all three hosting platforms/artifact modes and a pinned Node version;
- three fixed URLs and topology/SameSite/host-only decisions;
- exact proxy path, DNS/TLS ownership, and preview/indexing policy;
- secret store and staging-only database app identity;
- migration-user disabled/removed confirmation;
- synthetic customer/admin policies;
- email, log/redaction, monitoring, approval, and rollback ownership;
- edition and disabled-provider/manual-method policy;
- focused source remediation for readiness, logging/redaction, shutdown, CSP/config ambiguity, and health;
- filesystem/log/upload behavior.

Until those decisions are approved, the correct operational state is:

**DEPLOYMENT NOT EXECUTED; OWNER APPROVALS PENDING**

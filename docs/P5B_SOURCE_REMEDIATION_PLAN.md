# P5B Source Remediation Plan

## Gate

This plan is the required pre-implementation allowlist. P5B implementation may
begin only within the exact files listed below. Package files, lock files, real
environment files, models, schemas, migrations, P3 scripts, and commerce
business modules are outside the allowlist.

## Evidence-based source-gap audit

| Area | Actual pre-change implementation | Classification | P5B decision |
|---|---|---|---|
| Liveness/readiness | `backend/app.js` has only `/api/health`; it always returns 200 and reports a shallow Mongoose state | Platform-neutral and approved | Preserve the response and add separate `/api/ready` with bounded, sanitized internal checks |
| Database lifecycle | `backend/config/db.js` logs connection host/error text, owns reconnect timers, and registers process signal handlers | Platform-neutral and approved | Make it a signal-free connection abstraction with sanitized logging and one idempotent close operation |
| HTTP lifecycle | `backend/server.js` owns `listen`, but closes only HTTP, has no bound, and can expose raw startup error text | Platform-neutral and approved | Keep `app.js` listener-free; centralize bounded shutdown in a testable lifecycle owner |
| Fatal process events | No coordinated unhandled rejection/exception policy exists | Platform-neutral and approved | Route fatal process events through the same bounded lifecycle with failure exit status |
| Logging ownership | Active request/server logger, auth/common logger, and order logger independently create file transports | Platform-neutral and approved | Make `backend/common/utils/logger.js` canonical; retain compatibility modules as delegates |
| Secret redaction | No shared recursive key/value redaction contract exists | Platform-neutral and approved | Add canonical structured redaction for headers, cookies, tokens, credentials, URIs, provider-shaped keys, and sensitive references |
| Deployed logging | Active loggers require local log directories and omit console output in production | Platform-neutral and approved | Use stdout/stderr by default; create files only in development or explicit opt-in mode |
| Generic error logging | `req.originalUrl` can contain identifiers or query values | Platform-neutral and approved | Log the route template or a sanitized unmatched-route label, never the concrete URL |
| Email mode | Email service is mock-only but calls itself “sent” and logs recipient data; deployed mode is implicit | Platform-neutral and approved | Require explicit deployed `EMAIL_MODE=disabled|mock`; perform no network; retain test/development mock compatibility and remove personal/token logging |
| Email import casing | Windows resolves active `./EmailService` imports to the only tracked file, `services/emailService.js`; a case-sensitive deployment would fail | Platform-neutral and approved after focused-test discovery | Keep the tracked lowercase file canonical and correct only import/mock casing; do not change Auth behavior |
| `/uploads` | Static route exists, directory is absent, and no active upload writer or `multer` dependency was found | Platform-neutral and approved | Default deployed/test mode to disabled; development may expose read-only legacy static content; never create a directory or writer |
| Generated reports | Report CSV is streamed in the HTTP response; no local report file writer was found | Unnecessary | No source change |
| Temporary files | Test infrastructure uses OS temp for MongoDB binaries; no deployed application temp writer was found | Unnecessary | No source change |
| Storefront Next config | Installed Next 16.2.10 checks `next.config.js` before `next.config.ts`; build evidence confirms `next.config.js` is active. The two files disagree | Platform-neutral and approved | Keep `next.config.js` canonical and make `next.config.ts` a typed compatibility delegate; preserve active remote-image behavior |
| Storefront/admin health | Neither app has a dedicated health route | Platform-neutral and approved | Add deterministic `/healthz` route handlers with no environment or network access |
| Backend CSP | Active `middleware/security.js` enables inactive provider/Google/Cloudinary origins and unsafe inline script | Platform-neutral and approved | Derive allowed connect origins from validated runtime config, remove inactive provider origins, explicitly deny framing/objects, and avoid upgrade enforcement in local development |
| Frontend/admin CSP | A correct enforcing CSP depends on nonce/hosting/CDN decisions and Next script behavior | Owner/platform dependent and deferred | Do not guess an enforcing CSP; add only non-domain security headers |
| Inactive security middleware | `middleware/securityHeaders.js` has an unresolved import and is not mounted by `app.js` | Unsafe in P5B scope | Preserve as one of the six known inactive relative-import findings |
| Node pin | No package declares `engines`; Next 16.2.10 declares Node `>=20.9.0`; local verification used Node 24.18.0 | Owner/platform dependent and deferred | Record compatibility evidence; do not pin or edit packages/manifests |
| Artifact mode | Storefront active JS config does not select standalone; inactive TS does. Admin selects standalone | Owner/platform dependent and deferred | Preserve active behavior and leave final platform/artifact choice to owner |
| Proxy/SameSite/domains | P4 requires explicit deployed values but owner selections remain open | Owner/platform dependent and deferred | No value is selected or committed |
| Real email transport | No safe provider selection or credentials are approved | Blocked by missing owner/provider evidence | Implement no SMTP/provider transport |
| Local upload persistence | No active writer or approved durable storage exists | Unsafe | Add no writer or object-storage integration |

## Exact existing-file change allowlist

### Server, readiness, and runtime lifecycle

- `backend/app.js`
- `backend/server.js`
- `backend/config/db.js`
- `backend/config/runtime.config.js`

### Logging and sanitization

- `backend/common/utils/logger.js`
- `backend/middleware/logger.js`
- `backend/utils/logger.js`
- `backend/middleware/errorHandler.js`

### Email policy and compatibility

- `backend/config/email.config.js`
- `backend/services/emailService.js`
- `backend/services/AuthService.js` (import casing only)
- `backend/__tests__/auth.test.js` (mock/import casing only)
- `backend/tests/unit/services/auth.service.test.js` (mock casing only)

### Security headers

- `backend/middleware/security.js`

### Existing tests

- `backend/tests/unit/config/runtime.config.test.js`

### Next configuration clarification and browser headers

- `frontend/next.config.js`
- `frontend/next.config.ts`
- `admin-panel/next.config.ts`

## Exact new source/test file allowlist

### Backend operational source

- `backend/operations/lifecycleState.js`
- `backend/operations/readiness.js`
- `backend/operations/serverLifecycle.js`

### Backend focused tests

- `backend/tests/unit/operations/readiness.test.js`
- `backend/tests/unit/operations/serverLifecycle.test.js`
- `backend/tests/unit/common/logger.test.js`
- `backend/tests/unit/services/email.service.p5b.test.js`
- `backend/tests/integration/readiness.integration.test.js`
- `backend/tests/unit/contracts/p5b-operational.contract.test.js`

### Browser liveness routes

- `frontend/src/app/healthz/route.ts`
- `admin-panel/src/app/healthz/route.ts`

## Documentation allowlist

- `docs/P5B_PRE_CHANGE_GIT_STATUS.txt`
- `docs/P5B_PRE_CHANGE_WORKING_TREE.patch`
- `docs/P5B_PRE_CHANGE_FILE_INVENTORY.csv`
- `docs/P5B_RECOVERY_CHECKPOINT.md`
- `docs/P5B_PRE_CHANGE_BASELINE.md`
- `docs/P5B_SOURCE_REMEDIATION_PLAN.md`
- `docs/P5B_FILESYSTEM_AND_UPLOAD_POLICY.md`
- `docs/P5B_NODE_AND_ARTIFACT_COMPATIBILITY.md`
- `docs/P5B_OPERATIONAL_HARDENING_RUNBOOK.md`
- `docs/P5B_PRE_DEPLOYMENT_REMEDIATION_REPORT.md`

## Explicit exclusions

- No package or lock file.
- No `.env*` or private configuration file.
- No model, schema, index, migration, seed, or P3 script.
- No Auth, Order, Payment, Refund, Inventory, Product, Coupon, Return,
  Notification, or provider business module.
- No existing file deletion, move, rename, or archive.
- No cloud, Atlas, deployment, DNS, TLS, secret-store, external browser,
  provider, or email-provider operation.
- No remediation of the six inactive relative imports or existing lint/index
  warnings.

Any required change outside this allowlist is a stop condition and must be
reported rather than implemented.

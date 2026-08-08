# P5B Operational Hardening Runbook

## Scope

This runbook covers the platform-neutral source contracts added in P5B. It is
not authorization to deploy. All hosting, domain, runtime, artifact, proxy,
cookie, secret-store, monitoring, and traffic decisions remain subject to the
P5A owner decision gate.

## Required pre-deployment approvals

Before creating a deployment, the owner must resolve the open P5A decisions,
including hosting topology, exact Node runtime, artifact mode, public origins,
proxy trust, cookie SameSite policy, secret injection, monitoring, rollback,
DNS, and TLS ownership.

Never substitute production configuration or a generic backend database URI for
an environment-specific approved identity.

## Configuration contract

Inject values through the selected platform's secret/configuration mechanism;
do not commit values. Relevant variable names include:

- runtime: `APP_ENV`, `NODE_ENV`, `PORT`;
- database: `MONGODB_URI`;
- origins: `FRONTEND_URL`, `ADMIN_URL`, `BACKEND_PUBLIC_URL`,
  `TRUSTED_ORIGINS`, `TRUST_PROXY`;
- authentication cookies: the existing validated `AUTH_COOKIE_*` contract;
- operations: `EMAIL_MODE`, `LOCAL_UPLOADS_MODE`, `LOG_FILE_ENABLED`,
  `LOG_LEVEL`, `READINESS_DB_PING_ENABLED`,
  `READINESS_DB_PING_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`.

For isolated staging, the safe source-level posture is:

- `EMAIL_MODE=disabled`;
- `LOCAL_UPLOADS_MODE=disabled`;
- stdout/stderr logging with file logging disabled; and
- payment/provider activation flags remain disabled under the existing gates.

This runbook does not select actual values for origins, proxy hops, cookies,
runtime, or secrets.

## Startup sequence

1. Select the approved immutable artifact and exact runtime.
2. Inject environment-specific configuration without printing values.
3. Validate the separate staging database identity/marker gate before allowing
   traffic. `/api/ready` does not replace this identity gate.
4. Start `backend/server.js`; runtime validation must complete before listen.
5. Allow the database abstraction to establish its initial connection.
6. Verify backend liveness at `/api/health`.
7. Verify backend readiness at `/api/ready`; accept traffic only on HTTP 200.
8. Verify storefront and admin liveness at `/healthz`.
9. Keep external providers and email disabled until their separate gates pass.

Startup must fail closed on invalid required configuration. Sanitized reason
codes may be logged; URIs, credentials, tokens, cookies, personal data, and
provider values must not be logged.

## Health semantics

- `GET /api/health`: lightweight backend process liveness. It does not prove
  database identity or readiness.
- `GET /api/ready`: internal readiness. It returns 200 only when runtime state
  is initialized, shutdown has not begun, and MongoDB is ready. Optional
  database ping is bounded.
- Storefront/admin `GET /healthz`: deterministic Next-process liveness only.

A non-200 readiness result must remove the backend instance from traffic. Do
not restart solely because a browser `/healthz` route cannot prove backend
readiness.

## Logging

- Capture application stdout/stderr with the selected platform.
- Keep deployed file logging disabled unless explicitly approved.
- Alert on structured fatal-shutdown and readiness reason codes.
- Do not attach raw request headers, cookies, URLs with query strings, database
  URIs, or provider payloads to ordinary logs.
- Treat any redaction regression as a release blocker.

## Graceful shutdown

1. Deliver SIGTERM for routine termination.
2. The lifecycle owner marks the process as shutting down so readiness fails.
3. It stops accepting new HTTP connections and waits for the HTTP server close.
4. It closes database connections through the database abstraction.
5. It exits cleanly on completion or with a failure code on fatal/forced paths.
6. `SHUTDOWN_TIMEOUT_MS` bounds the operation; a forced timeout is an alert.

Repeated SIGTERM/SIGINT events are idempotent. The selected hosting platform
must grant a termination window longer than the approved application timeout.

## Rollback

1. Remove the failing artifact from traffic.
2. Restore the previous verified immutable artifact and its compatible
   environment contract.
3. Run liveness, readiness, browser health, and staging identity checks.
4. Keep providers/email disabled unless their separate gates remain valid.
5. Preserve failed-artifact logs and sanitized evidence for review.

No database rollback, migration, DNS change, or secret rotation is implied by
this source-only runbook. Those actions require their own approved procedures.


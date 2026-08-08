# P5A Deployment and Rollback Plan

## Status

**NON-EXECUTABLE PLAN — NO DEPLOYMENT AUTHORIZED**

Platform, origins, topology, proxy count, secrets, database identity, and operational owners are all pending. Angle-bracket text is an operator placeholder, not a command or value.

## Entry criteria

P5 execution may be proposed only after:

- all P5A owner decisions are approved;
- the P5A recovery checkpoint is verified;
- the focused source-remediation gate for readiness/logging/shutdown/CSP/configuration is approved and completed;
- a new clean local regression matches the accepted baseline;
- exact platform rollback procedures are recorded in the private change ticket;
- staging database application identity and network owners are available;
- no production or migration credential is present.

## Controlled sequence

| Step | Approved operator action | Required evidence | Stop condition |
|---:|---|---|---|
| 1 | Confirm every owner approval | Completed decision register with identities/timestamps | Any `PENDING`, conflict, or unauthorized approver |
| 2 | Verify recovery checkpoint | Authoritative backup path, manifest equality, Git identity | Missing backup, hash mismatch, overwritten backup |
| 3 | Create platform projects/services | Three isolated staging components created by authorized operator | Wrong organization/account/region or production linkage |
| 4 | Map sanitized variable names | Platform variable inventory matches injection plan | Unknown variable, generic environment reuse, secret in public scope |
| 5 | Inject secrets through approved store | Backend-only masked secret references; audit entry | Secret printed, exposed to build/frontend/admin, or entered as plain text |
| 6 | Verify providers disabled | Six explicit flags; external flags false; no credentials | Any external provider enabled/credential present |
| 7 | Supply database application identity | Backend receives only approved app secret reference | Migration/production identity or ambiguous URI source |
| 8 | Deploy backend with public traffic disabled | Immutable release identifier; start/log evidence sanitized | Process/startup/config failure or unsanitized database error |
| 9 | Check backend liveness/readiness | `/api/health` liveness plus separate operator database readiness gate | HTTP failure, database unavailable, or current liveness treated as readiness |
| 10 | Check database marker identity | Sanitized exact marker result from approved operator gate | Marker missing/duplicate/mismatched or production evidence |
| 11 | Deploy storefront | Immutable release built with approved API URL/edition procedure | Build failure, route count not 16, wrong public API URL |
| 12 | Deploy admin | Immutable release built with approved API URL/edition procedure | Build/type failure, route count not 25, wrong public API URL |
| 13 | Validate DNS/TLS | Fixed origins resolve to approved releases; certificates valid | Preview/wrong target, TLS failure, unintended IPv4/IPv6 path |
| 14 | Validate CORS/CSRF/cookies | Exact accepted/rejected origins; Secure/SameSite/host-only behavior | Wildcard, missing CSRF rejection, insecure/wrong-site cookie |
| 15 | Execute synthetic browser smoke | Signed smoke checklist and correlation/run identifier | Any unexpected provider/email/external call or security-flow failure |
| 16 | Perform exact smoke cleanup | IDs created by the run removed/revoked; counts reconcile | Broad cleanup query, residual synthetic record, or unrelated count change |
| 17 | Review monitoring/log redaction | Health/errors visible; secrets/PII absent; alert received | Missing monitoring, raw secrets/URI/token/email body in logs |
| 18 | Obtain keep-active approval | Deployment owner signs the verification record | No approval before the observation window expires |
| 19 | Finalize rollback references | Exact backend/storefront/admin/DNS rollback operations stored privately | Any component lacks a tested rollback target or owner |

## Traffic policy

- Backend is deployed dark/no-public-traffic first.
- No storefront/admin is configured to call the backend before database identity and readiness pass.
- Externally networked provider egress remains disabled throughout.
- Public traffic opens only after DNS/TLS, auth, CORS, CSRF, and cookie checks pass.
- Admin exposure should use platform access control where approved.

## Hard-stop conditions

Immediately stop and begin containment/rollback for:

1. any production identity, URI, host, marker, data, project, or credential;
2. database marker mismatch, missing marker, duplicate marker, or synthetic-data policy mismatch;
3. CORS wildcard or reflection of an unapproved Origin;
4. CSRF acceptance for an unknown/missing deployed Origin;
5. refresh or CSRF cookie missing Secure;
6. deployed `SameSite` not equal to the owner-approved topology decision;
7. wrong or unknown proxy-hop count;
8. secret/token/URI/password/certificate/private value exposed in build output, logs, client bundle, or UI;
9. any Stripe, JazzCash, or Easypaisa flag/credential/SDK request enabled;
10. any outbound provider or unapproved email request;
11. backend health failure or database readiness failure;
12. storefront route count other than 16 or admin route count other than 25 for the approved build;
13. local verification regression;
14. synthetic cleanup failure or unrelated data-count change;
15. uncontrolled preview origin;
16. invalid TLS, wrong DNS target, or unexpected IPv4/IPv6 route;
17. log redaction/monitoring failure;
18. platform cannot identify the exact previous immutable release.

## Rollback trigger thresholds

Rollback is mandatory on any hard stop. The deployment owner may also trigger rollback for sustained 5xx errors, login/refresh failure, database pool exhaustion, unexpected latency, health instability, or observability loss according to the approved monitoring thresholds.

## Platform-neutral rollback sequence

1. Stop new smoke activity and preserve sanitized correlation IDs.
2. Keep all provider flags disabled and revoke any release-specific outbound access.
3. Disable public traffic to the failing backend release.
4. Route backend to `<approved-previous-backend-release>`.
5. Route storefront to `<approved-previous-storefront-release>`.
6. Route admin to `<approved-previous-admin-release>`.
7. If DNS changed, restore `<approved-previous-dns-targets>` using the documented TTL procedure.
8. Restore only the previous approved **staging application** secret reference when credential rollback is necessary and safe.
9. Re-run liveness, staging marker identity, origin, cookie, and disabled-provider checks.
10. Clean only synthetic records identified by the failed smoke run.
11. Confirm no production/migration identity and no provider call occurred.
12. Record incident facts and keep the failed release inactive for forensic review.

Rollback must not run database `--drop`, broad deletion, production restore, migration rollback, or unscoped cleanup. Database recovery requires its own approved recovery procedure.

## Required private rollback-command register

Repository evidence cannot supply platform commands before platform selection. The P5 change ticket must contain and dry-review:

| Component | Required private entry |
|---|---|
| Backend | Exact immutable release identifier and platform rollback/traffic-switch operation |
| Storefront | Exact previous build/release and rollback operation |
| Admin | Exact previous build/release and rollback operation |
| DNS | Previous targets, record types, TTL, and authorized restore operation |
| TLS | Certificate/edge binding restore procedure |
| Secrets | Previous staging-only secret version and safe rollback eligibility |
| Network | Previous egress/access-list/private-network state |
| Monitoring | Alert suppression/incident channel and recovery confirmation |

Missing any entry blocks P5.

## Post-rollback verification

- All three approved origins return the intended previous release.
- Backend liveness and independent database identity/readiness pass.
- Login, refresh, logout, CORS, CSRF, and Secure cookies pass.
- Stripe/JazzCash/Easypaisa remain disabled and no credentials are present.
- Synthetic cleanup reconciles exact created IDs/counts.
- Logs contain no secret or sensitive payload.
- Owner signs rollback completion and determines whether a new P5 attempt is authorized.


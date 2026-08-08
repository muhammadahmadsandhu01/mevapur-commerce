# P5A Database Application Identity Injection Plan

## Objective

The future backend deployment may receive only the existing isolated **staging application** database identity. P5A does not read that identity, connect to Atlas, or validate live database state.

## Identity separation

| Identity | Application deployment access | Purpose |
|---|---|---|
| Staging application user | Allowed only after operator verification | Normal backend reads/writes in the approved isolated staging database |
| Temporary migration user | Forbidden | Schema/index migration only in an independently approved operator gate |
| Production user or URI | Forbidden | Never available to staging platform, operator session, logs, or fallback configuration |
| Developer/local test identity | Forbidden in deployment | Local database tests use loopback MongoDB Memory Server only |

## Approved injection model

1. Database/security owner re-verifies the staging application user out of band.
2. Verification confirms least privilege, staging-cluster restriction, approved database scope, and no migration-level privilege.
3. Operator confirms the temporary migration user is disabled or removed.
4. Operator stores the application URI in the approved secret store.
5. Only the backend service identity receives read access to that secret.
6. The platform injects it at runtime as `MONGODB_URI`.
7. Storefront, admin, build logs, preview services, and source-control automation never receive it.
8. The value is masked in configuration views, command output, logs, crash reports, and support bundles.
9. There is no fallback to a generic backend environment file, P3 private file, production URI, or alternate database.

## Pre-deployment identity gate

An approved operator—not the public application—must run a read-only gate before traffic:

- derive the selected database name without printing the URI;
- confirm it exactly matches the approved isolated staging database contract;
- read the approved environment marker using exact identifier criteria;
- confirm environment is staging;
- confirm data is synthetic-only;
- confirm production data is forbidden;
- require exactly one matching marker;
- record only sanitized pass/fail facts;
- stop immediately on missing, duplicate, malformed, or mismatched identity;
- never enumerate or print sensitive document contents.

The operator gate must be performed with the staging application identity unless a narrower read-only identity is separately approved. It must never use the migration or production identity.

## Network gate

- Atlas access list permits only approved platform staging egress identities.
- An unrestricted/global network allowlist is forbidden.
- Dynamic egress must be solved with approved fixed egress/private networking rather than widened access.
- DNS mode required by the approved URI must work on the platform, including SRV/TXT where applicable.
- No production project, cluster, hostname, or network rule is copied into staging.

## Connection behavior from active source

`backend/config/db.js` currently configures:

- server selection timeout: 10 seconds;
- maximum pool size: 20 per backend process;
- minimum pool size: 5 per backend process;
- retryable writes enabled;
- `autoIndex` disabled when `NODE_ENV=production`;
- reconnect scheduling after connection failure.

Capacity planning must account for each replica reserving a minimum of 5 and allowing up to 20 connections. Replica count multiplied by pool limits must stay within the staging cluster/user quota.

## Readiness and shutdown gaps

- Current `/api/health` always returns HTTP 200 and is not a database readiness proof.
- A failed initial connection can schedule retry while the HTTP server continues toward listening.
- Database connection errors include raw `error.message` in logs.
- `server.js` and `config/db.js` both register termination handlers.

Therefore P5 deployment traffic must remain off until the separate operator identity gate passes. A focused source-remediation milestone is recommended to add sanitized fail-fast/readiness behavior and coordinated shutdown before P5 execution.

## Startup/logging requirements

- Failure text exposed to platform logs must be generic and must not contain URI, username, password, hostnames, query parameters, or certificate material.
- Secret-store resolution failure is a hard stop.
- Database identity mismatch is a hard stop.
- Reconnect must never change the selected URI or database.
- Logs may record a correlation ID and sanitized error category only.
- Core dumps, environment dumps, and verbose driver logs must be disabled.

## Rotation and rollback

- Rotation owner: database/security owner.
- Rotation uses a staged new application credential, verifies identity/least privilege, updates the backend secret reference, restarts without printing values, and then revokes the old credential.
- Rollback may restore the previous **staging application** credential only if still approved and uncompromised.
- Migration or production credentials are never rollback options.

## P5 hard stops

- Migration credential present in application configuration.
- Production URI/project/cluster/database evidence.
- Marker mismatch or ambiguous marker count.
- Application user has migration/admin scope.
- Secret visible to frontend/admin/build output/logs.
- Global Atlas access list.
- Unsupported DNS/SRV behavior.
- Unapproved connection-pool capacity.
- Backend receives traffic before identity/readiness confirmation.

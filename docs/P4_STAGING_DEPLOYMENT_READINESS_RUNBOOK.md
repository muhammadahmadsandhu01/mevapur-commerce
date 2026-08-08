# P4 Staging Deployment Readiness Runbook

## Status and boundary

This runbook describes a future, separately approved staging deployment. P4
does not execute it. It contains no real URL, hostname, database identity,
credential, project identifier, or provider value.

Production deployment, Atlas migration, database seeding, provider activation,
Redis, Docker, CI/CD, and framework migration remain outside scope.

## 1. Approve staging URLs

Obtain written approval for exactly three HTTPS origins:

- storefront: `https://storefront.example.invalid`;
- admin: `https://admin.example.invalid`;
- backend: `https://api.example.invalid`.

Replace placeholders only in the deployment platform's protected environment,
never in source or this runbook. Record whether these hosts are same-site or
cross-site. Select `AUTH_COOKIE_SAME_SITE` only after that decision. Any
unapproved additional browser origin is a stop condition.

## 2. Verify DNS prerequisites

Before deployment:

1. verify each approved hostname has the intended DNS record;
2. verify no record resolves to a production target;
3. verify ownership/control through the deployment platform;
4. verify DNS propagation from more than one resolver; and
5. record sanitized PASS/FAIL evidence without private infrastructure details.

DNS mismatch, production crossover, dangling records, or unresolved ownership
stops the deployment.

## 3. Verify HTTPS certificate prerequisites

For each approved hostname:

1. issue a valid certificate through the approved platform;
2. verify hostname coverage, chain, validity period, and automatic renewal;
3. require HTTPS redirect at the edge;
4. reject expired, self-signed, mismatched, or incomplete chains; and
5. do not enable Secure cookies until the HTTPS endpoint is verified.

Certificate private keys must remain platform-managed and must never enter
source, logs, tickets, or browser configuration.

## 4. Inject frontend, admin, and backend environment

Use the reviewed matrix in
`docs/P4_STAGING_ENVIRONMENT_MATRIX.md`.

- Backend: set `NODE_ENV`, `APP_ENV`, `FRONTEND_URL`, `ADMIN_URL`,
  `BACKEND_PUBLIC_URL`, optional reviewed `TRUSTED_ORIGINS`, `TRUST_PROXY`,
  `AUTH_COOKIE_SECURE`, and `AUTH_COOKIE_SAME_SITE`.
- Storefront and admin: compile with their exact
  `NEXT_PUBLIC_API_URL`.
- Keep `FRONTEND_URL` and `ADMIN_URL` distinct.
- Never use wildcard CORS.
- Never reuse a local, P3 private, or production environment file.

Start the backend only after a dry configuration-validation command passes in
the deployment platform. A sanitized `RUNTIME_CONFIGURATION_INVALID` error is
a stop condition.

## 5. Inject secrets from the approved secret store

Inject by reference at runtime:

- `JWT_SECRET`;
- a separate `CSRF_SECRET`;
- the staging MongoDB application URI;
- SMTP credentials only after a separate email-provider approval; and
- payment credentials only in a later provider-activation milestone.

No secret may be pasted into source, build arguments visible to untrusted
users, deployment logs, screenshots, browser variables, or documentation.
Access must be least-privilege, staging-only, auditable, and rotatable.

## 6. Inject the database application user

Use only the already approved isolated staging application identity:

1. fetch `MONGODB_URI` from the staging secret-store reference;
2. verify the target identity before application start using the separately
   approved database identity procedure;
3. require least-privilege application permissions;
4. prohibit production data and production credentials;
5. prohibit schema initialization, index migration, restore, seed, or cleanup
   in this deployment runbook; and
6. stop on any identity, marker, database-name, or permission mismatch.

P4 does not perform this step and does not read the private P3 file.

## 7. Validate CORS, CSRF, cookie, and proxy behavior

After the future deployment is approved and healthy:

1. approved storefront preflight succeeds with credentials;
2. approved admin preflight succeeds with credentials;
3. an unlisted origin receives no CORS approval;
4. refresh and logout accept the approved Origin plus a valid signed CSRF
   cookie/header pair;
5. an unlisted or missing deployed Origin is rejected for CSRF-protected
   operations;
6. refresh cookie is HttpOnly, Secure, host-only, path `/api`, with the
   approved SameSite mode;
7. CSRF cookie is Secure, browser-readable, host-only, path `/`;
8. no access or refresh token appears in `localStorage` or `sessionStorage`;
9. proxy-derived protocol/IP behavior matches the approved hop count; and
10. raw payment webhook requests still reach signature verification as a
    `Buffer` before JSON parsing.

Do not send a real provider webhook. Use only the established local or approved
synthetic application smoke.

## 8. Keep provider flags disabled

Inject every provider flag explicitly as `false`:

- COD;
- bank transfer;
- Raast;
- Stripe;
- JazzCash; and
- Easypaisa.

Keep JazzCash/Easypaisa contract flags false. Do not inject Stripe or other
provider credentials. Provider activation and merchant onboarding require a
separate approval and runbook.

## 9. Execute the health and browser smoke sequence

Only after steps 1-8 pass:

1. start one staging backend instance;
2. call `/api/health` and require HTTP 200 without secret/config disclosure;
3. load storefront and admin over their approved HTTPS origins;
4. verify 16 storefront routes and 25 admin routes are present in the built
   artifacts;
5. perform register/login/me/refresh/logout with a synthetic staging user;
6. verify admin authentication and authorization guards;
7. verify product browsing and a non-provider checkout boundary using
   synthetic data only;
8. confirm no retired payment endpoint is requested;
9. inspect browser storage and cookie attributes; and
10. inspect sanitized logs for correlation IDs and unexpected errors.

Do not create a provider payment, invoke an external provider, use production
data, or mutate Atlas topology.

## 10. Rollback and stop conditions

Stop immediately on:

- origin, DNS, certificate, proxy, cookie, SameSite, CSRF, or database identity
  mismatch;
- any production endpoint or credential;
- any secret in output or client assets;
- any external provider request;
- any failed auth regression or route-count mismatch;
- any startup configuration bypass;
- any database migration/index/schema action; or
- any evidence that rollback is not ready.

Rollback means routing traffic away from the candidate and restoring the prior
verified application artifact plus its prior protected environment version.
It does not mean dropping a database, reversing indexes, deleting evidence, or
using destructive Git commands. Preserve logs and evidence with secrets
redacted.

## 11. Log and secret handling

- Log variable names, decisions, request IDs, status codes, and sanitized error
  codes only.
- Never log URIs, passwords, JWTs, cookies, CSRF values, authorization headers,
  provider payloads, webhook bodies, or secret-store output.
- Restrict staging logs by role and retention policy.
- Redact before attaching evidence.
- Treat a secret exposure as an incident: stop, revoke/rotate through the
  owner, and preserve sanitized incident evidence.

## 12. Required approval before deployment

The future deployment requires explicit approval from:

1. application owner for the candidate source state;
2. security owner for origins, SameSite, proxy trust, secrets, and log policy;
3. database owner for the isolated staging application identity;
4. operations owner for DNS, TLS, artifact, monitoring, and rollback; and
5. QA owner for the exact smoke and acceptance matrix.

Approval for this runbook is not approval for production or provider
activation. If any required decision is absent, remain at local readiness and
do not deploy.

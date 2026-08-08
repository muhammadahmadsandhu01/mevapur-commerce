# P3 Staging Environment Contract

## Purpose

This contract defines the minimum evidence required before MevaPur may connect
to an Atlas staging target. It contains variable names and validation
expectations only. It does not contain or authorize real values.

## Required Isolation Model

Staging must use:

- a dedicated Atlas project or, at minimum, a dedicated non-production cluster;
- a dedicated staging database;
- a dedicated least-privilege staging application user;
- a separate, temporary migration user with index-management privileges only
  when needed;
- staging-only JWT, CSRF, session, email, frontend, and admin configuration;
- synthetic data only;
- staging-only provider flags and sandbox credentials;
- a staging webhook hostname that is not a production callback;
- a secret store or private deployment configuration, never committed files.

A database suffix alone is not proof. The identity gate requires several
independent properties.

## Required Backend Variable Names

Identity and database:

- `APP_ENV`
- `STAGING_ENVIRONMENT_MARKER`
- `MONGODB_URI`
- `STAGING_DATABASE_NAME`
- `ATLAS_PROJECT_ID`
- `ATLAS_CLUSTER_NAME`
- `ATLAS_DATABASE_USER_ROLE`
- `STAGING_SYNTHETIC_DATA_MARKER`

Application and origins:

- `NODE_ENV`
- `PORT`
- `FRONTEND_URL`
- `ADMIN_URL`
- `STAGING_BACKEND_ORIGIN`
- `STAGING_FRONTEND_ORIGIN`
- `STAGING_ADMIN_ORIGIN`

Authentication:

- `JWT_SECRET`
- `JWT_ACCESS_EXPIRE`
- `JWT_REFRESH_EXPIRE`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `CSRF_SECRET`
- `AUTH_COOKIE_SAME_SITE`
- `REFRESH_COOKIE_NAME`
- `CSRF_COOKIE_NAME`
- `AUTH_MAX_LOGIN_ATTEMPTS`
- `AUTH_LOCKOUT_DURATION`
- `AUTH_RESET_TOKEN_EXPIRY`
- `AUTH_AUTO_VERIFY_EMAIL`

Email:

- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`

Commerce:

- `PAYMENT_EDITION`
- `PAYMENT_PROVIDER_COD_ENABLED`
- `PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED`
- `PAYMENT_PROVIDER_RAAST_ENABLED`
- `PAYMENT_PROVIDER_STRIPE_ENABLED`
- `PAYMENT_PROVIDER_JAZZCASH_ENABLED`
- `PAYMENT_PROVIDER_EASYPAISA_ENABLED`
- `BANK_TRANSFER_ACCOUNT_TITLE`
- `BANK_TRANSFER_BANK_NAME`
- `BANK_TRANSFER_PUBLIC_ACCOUNT_REFERENCE`
- `RAAST_ACCOUNT_TITLE`
- `RAAST_PUBLIC_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `JAZZCASH_OFFICIAL_CONTRACT_APPROVED`
- `EASYPAISA_OFFICIAL_CONTRACT_APPROVED`

Migration controls:

- `P3_MIGRATION_MODE`
- `P3_MIGRATION_EXPECTED_DATABASE`
- `P3_MIGRATION_EXPECTED_PROJECT_ID`
- `P3_MIGRATION_EXPECTED_CLUSTER`
- `P3_MIGRATION_REQUIRED_BACKUP_ID`
- `P3_MIGRATION_ALLOWLIST_VERSION`
- `P3_MIGRATION_CHANGE_TICKET`

## Safe Value Expectations

- `NODE_ENV` should use production security behavior in an internet-accessible
  staging deployment so cookies are Secure and production credential checks
  apply.
- `APP_ENV` and `STAGING_ENVIRONMENT_MARKER` must independently identify
  staging.
- JWT and CSRF secrets must be unique to staging, random, and rotated before
  reuse of a staging environment.
- `MONGODB_URI` must identify the approved staging cluster/user/database.
- `STAGING_DATABASE_NAME` must exactly match the URI-selected database and the
  approved change record.
- `PAYMENT_EDITION` must be one of `pakistan`, `international`, or `full`.
- Stripe/JazzCash/Easypaisa flags remain false for P3.
- Manual bank/Raast display fields must contain staging-only public identifiers.
- No production customer data, provider key, webhook secret, JWT secret, email
  credential, hostname, or cookie namespace may be reused.

## Database Privileges

The staging application user should have only the CRUD privileges needed by the
application on the approved staging database. It must not have production
project/database access.

The temporary migration user should:

- be separate from the application user;
- be scoped to the approved staging database;
- have only the privileges necessary to list/create/drop the exact allowlisted
  indexes;
- have no production access;
- be disabled or rotated after the change window.

## Cookie and CORS Contract

- HTTPS is mandatory.
- Refresh cookie: HttpOnly, Secure, path `/api`.
- CSRF cookie: Secure, readable by the approved client, never treated as an
  authentication credential.
- `SameSite=None` is permitted only with Secure cookies and separately hosted
  HTTPS clients.
- CORS must allow only the exact staging storefront and admin origins and must
  allow credentials.
- The current `app.js` dynamically reads only `FRONTEND_URL`; admin staging
  origin support must be explicitly reviewed before deployment because the
  remaining allowed admin origins are hard-coded.
- Production origins must not be used as staging origins.

## Provider Contract

For P3:

- COD may be enabled for synthetic smoke testing.
- Bank transfer and Raast may be enabled only with clearly synthetic public
  merchant-display fields.
- Stripe, JazzCash, and Easypaisa must remain disabled.
- No live provider credentials or live callback endpoints are permitted.
- Provider availability must be verified through
  `GET /api/payments/methods`, not inferred from environment presence.

## Production Separation Checks

Before startup or migration, an operator must verify:

1. change ticket identifies staging;
2. Atlas project and cluster match the approved staging inventory;
3. database name matches the approved staging database;
4. authenticated user is dedicated to staging/migration;
5. staging marker is present;
6. synthetic marker exists and production marker is absent;
7. production database name/user/project/cluster do not match;
8. production provider credentials are absent;
9. staging frontend/admin/backend origins are distinct;
10. no production documents were copied into staging.

Any mismatch is a hard stop.

## Staging Startup

Values must be injected privately by the approved secret store before running:

```text
cd C:\Projects\mevaPur-Commerce\backend
npm.cmd start
```

Storefront:

```text
cd C:\Projects\mevaPur-Commerce\frontend
npm.cmd run build
npm.cmd start
```

Admin:

```text
cd C:\Projects\mevaPur-Commerce\admin-panel
npm.cmd run build
npm.cmd start
```

The operator must record sanitized process IDs, exact edition, deployment
version, health result, and target identity decision. Commands must not echo
environment values.

## Staging Shutdown

- stop only the exact recorded staging application processes through the
  deployment/process manager;
- wait for graceful HTTP shutdown;
- verify no staging listener remains;
- retain logs after sanitization;
- do not stop production processes;
- revoke the temporary migration user after evidence capture.

## Secret Rotation

Rotate staging JWT/CSRF/session, database migration-user, SMTP, and sandbox
provider secrets:

- after any exposure suspicion;
- after personnel/access changes;
- after a migration window;
- before promoting a long-lived staging environment;
- before reusing a restored staging snapshot.

No staging secret may be promoted to production.

## Current Result

The private standard non-SRV configuration passes 32/32 offline checks. The
application and migration identities both passed live authentication, exact
database selection, and exact marker verification. The source contains one
marker collection/document and zero non-marker documents. No private value was
copied into the repository.

The database identity contract is satisfied. Application deployment/smoke
remains blocked by the index-migration dry-run: all allowlisted application
collections are absent, and using index creation to create them would violate
the approved unchanged collection-count contract.

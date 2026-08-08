# P5A Sanitized Environment Injection Plan

## Rules

- This plan contains variable names and non-routable placeholders only.
- Real values must be entered by an approved operator directly into the selected secret/configuration system.
- Backend secrets are backend-runtime only.
- Any `NEXT_PUBLIC_*` value is public and is compiled into browser JavaScript.
- No secret, credential, private URI, token-signing material, session secret, or webhook secret may use a `NEXT_PUBLIC_*` name.
- `BACKEND_PUBLIC_URL` is canonical. `STAGING_BACKEND_ORIGIN` is a compatibility fallback and should not be used for a new P5 deployment.
- Public client variables require a new build when changed.

## Backend injection matrix

| Variable | Timing | Exposure | Requirement | Validation | Safe placeholder | Rotation owner | Failure behavior |
|---|---|---|---|---|---|---|---|
| `NODE_ENV` | Runtime | Public operational | Mandatory | Set to supported deployed mode; P5 contract uses `production` | `production` | Platform owner | Invalid value stops app import |
| `APP_ENV` | Runtime | Public operational | Mandatory | Exact supported application mode; P5 uses `staging` | `staging` | Platform owner | Missing/invalid value stops app import |
| `PORT` | Runtime | Public operational | Platform-conditional | Positive platform-provided port | `<platform-port>` | Platform owner | Process cannot receive traffic |
| `MONGODB_URI` | Runtime | **Secret** | Mandatory | Approved staging application identity only; never migration/production; URI structure checked without logging | `<secret-ref:staging-db-app-uri>` | Database/security owner | Stop deployment; never fall back |
| `FRONTEND_URL` | Runtime | Public | Mandatory | Exact HTTPS origin; no path/query/credentials | `https://shop.staging.example.invalid` | DNS/application owner | Missing/malformed value stops app import |
| `ADMIN_URL` | Runtime | Public | Mandatory | Exact HTTPS origin, distinct from storefront | `https://admin.staging.example.invalid` | DNS/application owner | Missing/malformed/equal value stops app import |
| `BACKEND_PUBLIC_URL` | Runtime | Public | Mandatory | Exact HTTPS origin | `https://api.staging.example.invalid` | DNS/application owner | Missing/malformed value stops app import |
| `TRUSTED_ORIGINS` | Runtime | Public policy | Optional; empty is safest | Comma-separated exact HTTPS origins; wildcard forbidden | empty or `https://ops.staging.example.invalid` | Security owner | Invalid entry stops app import |
| `AUTH_COOKIE_SAME_SITE` | Runtime | Public policy | Mandatory | `strict`, `lax`, or `none`; owner topology decision required | `<approved-samesite>` | Security owner | Missing/invalid value stops app import |
| `AUTH_COOKIE_SECURE` | Runtime | Public policy | Mandatory | Boolean text; must be `true` in staging | `true` | Security owner | Missing/false/invalid value stops app import |
| `TRUST_PROXY` | Runtime | Public operational | Mandatory | `false` for direct ingress or exact integer 1–10; broad true forbidden | `<approved-hop-count>` | Platform/security owner | Missing/invalid value stops app import |
| `JWT_SECRET` | Runtime | **Secret** | Mandatory | Independent random value, at least 32 characters in staging | `<secret-ref:staging-jwt>` | Security owner | Missing/short value stops app import |
| `CSRF_SECRET` | Runtime | **Secret** | Mandatory by deployment gate | Independent random value; do not rely on JWT fallback | `<secret-ref:staging-csrf>` | Security owner | Deployment approval stops even though code has fallback |
| `JWT_ACCESS_EXPIRE` | Runtime | Public policy | Optional but explicitly approve | Valid duration; current default `15m` | `15m` | Security owner | Invalid value can cause token startup/runtime failure |
| `JWT_REFRESH_EXPIRE` | Runtime | Public policy | Optional but explicitly approve | Valid duration; current default `7d` | `7d` | Security owner | Invalid value can cause cookie/session mismatch |
| `JWT_ISSUER` | Runtime | Public policy | Optional; recommended explicit | Same non-secret value on every replica | `mevapur-staging` | Security owner | Mismatch rejects tokens |
| `JWT_AUDIENCE` | Runtime | Public policy | Optional; recommended explicit | Same non-secret value on every replica | `mevapur-users` | Security owner | Mismatch rejects tokens |
| `REFRESH_COOKIE_NAME` | Runtime | Public policy | Optional; recommended explicit | Valid cookie name, identical on every replica | `refreshToken` | Security owner | Mismatch breaks refresh/logout |
| `CSRF_COOKIE_NAME` | Runtime | Public policy | Optional; recommended explicit | Valid cookie name, identical on every replica | `csrfToken` | Security owner | Mismatch breaks protected cookie operations |
| `PAYMENT_EDITION` | Runtime | Public policy | Mandatory | `pakistan`, `international`, or `full`; no implicit fallback accepted by runbook | `<approved-edition>` | Product/payment owner | Stop deployment on absence/unknown choice |
| `PAYMENT_PROVIDER_COD_ENABLED` | Runtime | Public policy | Mandatory | Explicit boolean | `false` | Product/payment owner | Stop deployment if missing or contrary to approval |
| `PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED` | Runtime | Public policy | Mandatory | Explicit boolean | `false` | Product/payment owner | Stop deployment if missing or contrary to approval |
| `PAYMENT_PROVIDER_RAAST_ENABLED` | Runtime | Public policy | Mandatory | Explicit boolean | `false` | Product/payment owner | Stop deployment if missing or contrary to approval |
| `PAYMENT_PROVIDER_STRIPE_ENABLED` | Runtime | Public policy | Mandatory | Explicit `false` for initial staging | `false` | Payment/security owner | Stop deployment if not false |
| `PAYMENT_PROVIDER_JAZZCASH_ENABLED` | Runtime | Public policy | Mandatory | Explicit `false` for initial staging | `false` | Payment/security owner | Stop deployment if not false |
| `PAYMENT_PROVIDER_EASYPAISA_ENABLED` | Runtime | Public policy | Mandatory | Explicit `false` for initial staging | `false` | Payment/security owner | Stop deployment if not false |
| `JAZZCASH_OFFICIAL_CONTRACT_APPROVED` | Runtime | Public policy | Mandatory | Explicit `false` | `false` | Payment/legal owner | Stop deployment if not false |
| `EASYPAISA_OFFICIAL_CONTRACT_APPROVED` | Runtime | Public policy | Mandatory | Explicit `false` | `false` | Payment/legal owner | Stop deployment if not false |
| `BANK_TRANSFER_ACCOUNT_TITLE` | Runtime | Public display | Conditional | Supply only after bank transfer is approved; non-secret customer display text | `Example Merchant` | Payment owner | Bank transfer remains unavailable |
| `BANK_TRANSFER_BANK_NAME` | Runtime | Public display | Conditional | Supply only after bank transfer is approved | `Example Bank` | Payment owner | Bank transfer remains unavailable |
| `BANK_TRANSFER_PUBLIC_ACCOUNT_REFERENCE` | Runtime | Public display | Conditional | Public reference only; never a credential | `EXAMPLE-REFERENCE` | Payment owner | Bank transfer remains unavailable |
| `RAAST_ACCOUNT_TITLE` | Runtime | Public display | Conditional | Supply only after Raast is approved | `Example Merchant` | Payment owner | Raast remains unavailable |
| `RAAST_PUBLIC_ID` | Runtime | Public display | Conditional | Deliberately public identifier only | `example.invalid` | Payment owner | Raast remains unavailable |
| `LOG_LEVEL` | Runtime | Public operational | Optional/ambiguous | Known by one logger; does not control the full active logging path | `info` | Operations/security owner | Logging remains inconsistent; source remediation gate applies |

### Backend variables that must not be injected initially

The following names exist in configuration or provider code but must be omitted until a separate approved activation milestone:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the storefront

`JWT_REFRESH_SECRET` is a legacy inactive field and is not consumed by the active token contract. Setting it does not improve refresh-token security and is not part of P5.

## Storefront injection matrix

| Variable/capability | Timing | Exposure | Requirement | Validation | Safe placeholder | Rotation owner | Failure behavior |
|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Build time | Public/browser | Mandatory | Approved backend HTTPS URL including `/api`; no secret material | `https://api.staging.example.invalid/api` | Application/platform owner | Build may pass, but browser API/CORS flows fail; deployment must stop |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Build time | Public/browser | Must be absent initially | If ever approved, publishable-key format only; never a secret key | omitted | Payment owner | Stripe UI stays unavailable, which is required initially |
| Storefront edition | Not implemented as a public variable | Public policy | Owner decision required, but no injectable browser variable exists | Use backend `PAYMENT_EDITION` plus edition build verification | `<approved-backend-edition>` | Product owner | Do not invent a variable; any source need is a future milestone |
| Public provider display flags | Not implemented as public variables | Public/browser | Absent | Provider availability must come from supported backend API contract | not applicable | Product/payment owner | Do not inject invented `NEXT_PUBLIC_*` flags |
| Public branding/configuration | No active environment names found | Public/browser | Optional future source work | Only documented, non-secret values may become public | not applicable | Product owner | No current injection |

## Admin injection matrix

| Variable/capability | Timing | Exposure | Requirement | Validation | Safe placeholder | Rotation owner | Failure behavior |
|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Build time | Public/browser | Mandatory | Approved backend HTTPS URL including `/api`; no secret material | `https://api.staging.example.invalid/api` | Application/platform owner | Admin API/auth flows fail; deployment must stop |
| Admin edition | Not implemented as a public variable | Public policy | Owner decision required, but no injectable browser variable exists | Use backend `PAYMENT_EDITION` and verify compatible admin build | `<approved-backend-edition>` | Product owner | Do not invent a variable |
| Public provider display flags | Not implemented as public variables | Public/browser | Absent | Read supported availability from backend | not applicable | Product/payment owner | Do not inject invented flags |

## Requested categories with no active variable

| Requested category | Repository evidence | P5 handling |
|---|---|---|
| Explicit email mode | No active `EMAIL_MODE` or equivalent fail-closed selector | Keep SMTP values absent; treat current email service as mock; approve a source/config milestone before any outbound mail |
| Health/readiness configuration | No active readiness variable or database-gated readiness endpoint | Platform liveness may use `/api/health`; traffic readiness requires operator database identity gate and approved source remediation |
| Browser edition selector | No active `NEXT_PUBLIC_*` edition name | Do not invent one |
| Browser provider display flags | No active `NEXT_PUBLIC_*` flag family | Do not invent one |

## Injection order

1. Owner decisions and platform facts approved.
2. Public values mapped without secrets.
3. Backend secret references created by the authorized operator.
4. Migration and production database identities explicitly rejected.
5. Provider flags injected explicitly; external providers confirmed false.
6. Storefront/admin built once with the exact approved public API URL.
7. Secret/log masking reviewed before the backend process starts.
8. Configuration import gate executed without displaying values.
9. Deployment stops on any missing, malformed, ambiguous, or unexpectedly enabled value.

## Explicit secret-exposure verification

- Backend secret names found in source: `MONGODB_URI`, `JWT_SECRET`, `CSRF_SECRET`, provider secrets, and optional SMTP credentials.
- Active browser names found in source: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- No backend private secret is assigned to an active `NEXT_PUBLIC_*` name.
- Initial staging must omit the Stripe browser key as well as every server provider credential.


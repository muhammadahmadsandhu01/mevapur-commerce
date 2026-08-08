# P4 Staging Environment Matrix

## Safety and notation

This is a sanitized configuration contract. It contains variable names,
validation rules, and non-routable examples only. It does not contain or derive
any value from a real environment file or the private P3 configuration.

Requirement notation:

- `R`: required.
- `O`: optional.
- `C`: conditionally required.
- `N`: do not set for this mode.

Secret values must be injected from the approved secret store at runtime.
Variables prefixed `NEXT_PUBLIC_` are compiled into browser assets and must
never contain a secret.

## Runtime, origin, cookie, CSRF, and proxy contract

| Variable or source | Purpose | Dev | Test | Staging | Production | Sanitized example | Validation/default | Exposure | Failure behavior |
|---|---|---:|---:|---:|---:|---|---|---|---|
| `NODE_ENV` | Node/framework mode | O | R | R | R | `production` | Supports `development`, `test`, `staging`, `production`; deployed runbook uses `production` | Public operational metadata | Unsupported value stops app import |
| `APP_ENV` | MevaPur runtime decision, overriding `NODE_ENV` when set | O | O | R | O | `staging` | Supports the same four names; `dev` normalizes to `development` | Public operational metadata | Unsupported value stops app import |
| `FRONTEND_URL` | Customer storefront origin | O | O | R | R | `https://storefront.example.invalid` | Exact origin only; HTTPS deployed; no credentials/path/query/fragment; dev/test default `http://localhost:3000` | Public | Missing/malformed deployed value stops app import |
| `ADMIN_URL` | Admin-panel origin | O | O | R | R | `https://admin.example.invalid` | Same origin rules; dev/test default `http://localhost:3001`; must differ from storefront when deployed | Public | Missing/malformed/equal deployed value stops app import |
| `BACKEND_PUBLIC_URL` | Canonical public backend origin | O | O | C | R | `https://api.example.invalid` | Exact HTTPS origin deployed; dev/test default `http://localhost:5000`; preferred in staging | Public | Missing/malformed required value stops app import |
| `STAGING_BACKEND_ORIGIN` | P3 staging compatibility alias for backend origin | N | N | C | N | `https://api.example.invalid` | Accepted only as staging fallback when `BACKEND_PUBLIC_URL` is absent; same HTTPS/origin validation | Public | Missing together with preferred variable stops app import |
| `TRUSTED_ORIGINS` | Additional explicitly approved browser origins | O | O | O | O | `https://support.example.invalid,https://ops.example.invalid` | Comma-separated exact origins; each fully validated; `*` rejected; safe default is empty | Public | Any invalid entry stops app import |
| CORS allowlist | Credentialed browser CORS source | Derived | Derived | Derived | Derived | Not a separate variable | Exactly `FRONTEND_URL`, `ADMIN_URL`, and `TRUSTED_ORIGINS`; credentials always enabled | Public policy | Unlisted origin receives no CORS approval |
| CSRF trusted origins | Origin check for cookie-auth mutations | Derived | Derived | Derived | Derived | Not a separate variable | Uses the identical allowlist function as CORS; Origin required when deployed | Public policy | Invalid/missing deployed Origin returns canonical CSRF rejection |
| `AUTH_COOKIE_SECURE` | Secure flag for refresh and CSRF cookies | O | O | R | R | `true` | Boolean text only; deployed value must be `true`; dev/test default `false` | Public policy | Invalid/missing/insecure deployed value stops app import |
| `AUTH_COOKIE_SAME_SITE` | Explicit cookie-site policy | O | O | R | R | `lax` | `strict`, `lax`, or `none`; dev/test default `lax`; `none` requires Secure | Public policy | Missing/invalid deployed value stops app import |
| Cookie domain | Refresh/CSRF host scope | Derived | Derived | Derived | Derived | Host-only | No environment variable is supported; domain remains unset | Public policy | A shared-domain assumption cannot be injected silently |
| `TRUST_PROXY` | Express proxy trust decision | O | O | R | R | `1` | `false` or integer hop count `1` through `10`; broad `true` rejected; dev/test default `false` | Public operational metadata | Missing/invalid deployed value stops app import |
| `PORT` | Backend listen port | O | O | O | O | `5000` | Positive platform-provided port; current server fallback is `5000` | Public operational metadata | Platform/startup failure if unusable |
| `NEXT_PUBLIC_API_URL` | Storefront/admin API base URL | O | O | R | R | `https://api.example.invalid/api` | Public HTTP(S) API URL; both clients use credentialed requests; loopback fallback is development only | Public/browser | Wrong value causes browser API/CORS failures |

### SameSite deployment decision

The repository does not prove whether the approved frontend/admin/backend
hosts share one registrable site. Therefore P4 does not choose a deployed
default:

- use `lax` or `strict` only when the approved topology and browser flows are
  compatible with same-site cookies;
- use `none` only for a genuinely cross-site HTTPS topology;
- keep cookies host-only unless a separate security design approves a domain.

## Authentication and session security

| Variable | Purpose | Dev | Test | Staging | Production | Sanitized example | Validation/default | Exposure | Failure behavior |
|---|---|---:|---:|---:|---:|---|---|---|---|
| `JWT_SECRET` | Signs active access and refresh tokens | R | O | R | R | `<secret-store:mevapur/staging/jwt>` | Non-empty; staging/production minimum 32 characters; tests use a fixed test-only fallback | Secret | Missing or short deployed value stops app import |
| `CSRF_SECRET` | HMAC key for CSRF double-submit token | C | C | R (runbook) | R (runbook) | `<secret-store:mevapur/staging/csrf>` | Current code falls back to `JWT_SECRET`; staging runbook requires a separate injected secret | Secret | No current startup failure when absent; deployment approval must stop |
| `JWT_REFRESH_SECRET` | Legacy configuration field | N | N | N | N | Not applicable | Not consumed by active `TokenService`; active refresh tokens use `JWT_SECRET` and hashed Session records | Secret if ever reactivated | Setting it does not alter the active token contract |
| `JWT_ACCESS_EXPIRE` | Access-token lifetime | O | O | O | O | `15m` | Duration string; current default `15m` | Public policy | Invalid text falls through library/startup behavior |
| `JWT_REFRESH_EXPIRE` | Refresh-token/cookie lifetime | O | O | O | O | `7d` | Duration string; current default `7d` | Public policy | Invalid cookie duration falls back to seven days |
| `JWT_ISSUER` | JWT issuer constraint | O | O | O | O | `mevapur-staging` | Non-secret string; must match across instances; current default `mevapur-auth` | Public policy | Mismatch rejects tokens |
| `JWT_AUDIENCE` | JWT audience constraint | O | O | O | O | `mevapur-users` | Non-secret string; must match across instances | Public policy | Mismatch rejects tokens |
| `REFRESH_COOKIE_NAME` | Refresh-cookie name | O | O | O | O | `refreshToken` | Non-empty cookie name; current default shown | Public policy | Mismatch breaks refresh/logout flow |
| `CSRF_COOKIE_NAME` | CSRF-cookie name | O | O | O | O | `csrfToken` | Non-empty cookie name; current default shown | Public policy | Mismatch breaks protected cookie operations |

Session state is stored in MongoDB. The refresh-token hash is stored in the
Session model; no plaintext refresh token or separate session secret is
required.

## Database and email

| Variable | Purpose | Dev | Test | Staging | Production | Sanitized example | Validation/default | Exposure | Failure behavior |
|---|---|---:|---:|---:|---:|---|---|---|---|
| `MONGODB_URI` | Application database connection | R | N for P4 local tests | R | R | `<secret-store:mevapur/staging/mongodb-app-uri>` | Secret-store reference only; tests must replace it with loopback Memory Server when DB tests run | Secret | Database/startup health fails; never fall back to another environment |
| `EMAIL_FROM` | Sender display/address | O | O | C | C | `MevaPur Staging <noreply@example.invalid>` | Sanitized mailbox syntax; current default exists | Public | Current mock email remains local; real SMTP activation must stop if unapproved |
| `SMTP_HOST` | SMTP endpoint | N | N | C | C | `smtp.example.invalid` | Required only after separate email-provider approval | Sensitive configuration | Email delivery unavailable |
| `SMTP_PORT` | SMTP port | N | N | C | C | `587` | Integer; current default `587` | Public operational metadata | Email delivery unavailable |
| `SMTP_SECURE` | Direct TLS decision | N | N | C | C | `true` | Boolean text | Public policy | Email delivery unavailable/misconfigured |
| `SMTP_USER` | SMTP identity | N | N | C | C | `<secret-store:mevapur/staging/smtp-user>` | Secret-store reference only | Secret | Email delivery unavailable |
| `SMTP_PASSWORD` | SMTP credential | N | N | C | C | `<secret-store:mevapur/staging/smtp-password>` | Secret-store reference only | Secret | Email delivery unavailable |

The current `EmailService` is a mock. P4 does not activate SMTP. Staging must
keep outbound email disabled until a separately approved provider milestone.

## Payment edition, provider flags, and public display data

| Variable or family | Purpose | Dev | Test | Staging | Production | Sanitized example | Validation/default | Exposure | Failure behavior |
|---|---|---:|---:|---:|---:|---|---|---|---|
| `PAYMENT_EDITION` | Provider manifest selection | O | R in payment tests | R | R | `pakistan` | `pakistan`, `international`, or `full`; current runtime fallback is `pakistan` | Public policy | Unknown value falls back; runbook must stop deployment |
| `PAYMENT_PROVIDER_COD_ENABLED` | COD feature flag | O | O | R | R | `false` | Boolean text; current code defaults `true` | Public policy | Runbook requires explicit decision |
| `PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED` | Bank-transfer feature flag | O | O | R | R | `false` | Boolean text; current code defaults `true` | Public policy | Runbook requires explicit decision |
| `PAYMENT_PROVIDER_RAAST_ENABLED` | Raast feature flag | O | O | R | R | `false` | Boolean text; current code defaults `true` | Public policy | Runbook requires explicit decision |
| `PAYMENT_PROVIDER_STRIPE_ENABLED` | Stripe feature flag | O | O | R | R | `false` | Boolean text; current default `false` | Public policy | Must remain false until provider approval |
| `PAYMENT_PROVIDER_JAZZCASH_ENABLED` | JazzCash feature flag | O | O | R | R | `false` | Boolean text; current default `false` | Public policy | Must remain false; provider is unavailable |
| `PAYMENT_PROVIDER_EASYPAISA_ENABLED` | Easypaisa feature flag | O | O | R | R | `false` | Boolean text; current default `false` | Public policy | Must remain false until provider approval |
| `BANK_TRANSFER_ACCOUNT_TITLE` | Customer-visible account title | O | O | C | C | `Example Merchant` | Required only if bank transfer is separately enabled; never put credentials here | Public display | Provider remains unconfigured/unavailable |
| `BANK_TRANSFER_BANK_NAME` | Customer-visible bank name | O | O | C | C | `Example Bank` | Same condition as above | Public display | Provider remains unconfigured/unavailable |
| `BANK_TRANSFER_PUBLIC_ACCOUNT_REFERENCE` | Customer-visible payment reference | O | O | C | C | `EXAMPLE-REFERENCE` | Public reference only; never a secret account credential | Public display | Provider remains unconfigured/unavailable |
| `RAAST_ACCOUNT_TITLE` | Customer-visible Raast title | O | O | C | C | `Example Merchant` | Required only if Raast is separately enabled | Public display | Provider remains unconfigured/unavailable |
| `RAAST_PUBLIC_ID` | Customer-visible Raast identifier | O | O | C | C | `example.invalid` | Deliberately public identifier only | Public display | Provider remains unconfigured/unavailable |
| `STRIPE_SECRET_KEY` | Stripe server credential | N | Test fixture only | N in P4 | C after approval | `<secret-store:mevapur/approved/stripe-secret>` | Provider-specific format and environment mode checks | Secret | Stripe remains unavailable |
| `STRIPE_WEBHOOK_SECRET` | Stripe signature-verification secret | N | Test fixture only | N in P4 | C after approval | `<secret-store:mevapur/approved/stripe-webhook>` | Provider-specific format; required for live webhook verification | Secret | Webhook returns not-configured error |
| `STRIPE_PUBLISHABLE_KEY` | Server-side public Stripe key metadata | N | Test fixture only | N in P4 | C after approval | `pk_test_placeholder` | Publishable key only; never substitute a secret key | Public | Stripe remains unavailable |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser Stripe publishable key fallback | N | Test fixture only | N in P4 | C after approval | `pk_test_placeholder` | Public key only; compiled into storefront bundle | Public/browser | Stripe UI remains unavailable |
| `JAZZCASH_OFFICIAL_CONTRACT_APPROVED` | Provider contract gate | N | O | R (`false`) | R (`false` until approval) | `false` | Boolean text; current default false | Public policy | Provider remains unavailable |
| `EASYPAISA_OFFICIAL_CONTRACT_APPROVED` | Provider contract gate | N | O | R (`false`) | R (`false` until approval) | `false` | Boolean text; current default false | Public policy | Provider remains unavailable |

For the P4 runbook, every provider flag is injected explicitly as `false`.
No provider credential is injected and no provider request is permitted.

## Fail-closed staging minimum

Before a future staging process may start, the approved operator must provide:

1. `NODE_ENV=production` and `APP_ENV=staging`;
2. all three approved HTTPS application origins;
3. an explicit proxy-hop decision;
4. explicit Secure and SameSite cookie decisions;
5. JWT, CSRF, and database application credentials from the secret store;
6. a public API URL for both browser builds; and
7. explicit disabled values for all provider flags.

Absence or ambiguity is a stop condition, not permission to reuse development,
P3 private, or production configuration.

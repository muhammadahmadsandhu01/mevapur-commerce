# P5A Browser Smoke Plan

## Status and safety

**DESIGN ONLY — NOT EXECUTED**

The future smoke uses only fixed staging origins, synthetic identities, the isolated staging application database, and disabled external providers. No production identity, real customer data, live payment credential, outbound email, or broad cleanup is allowed.

Method codes:

- `BA`: browser automation
- `HTTP`: direct HTTP check
- `OP`: operator confirmation
- `DB`: sanitized database aggregate/identity confirmation by approved operator

## Preconditions

- All owner decisions approved.
- Exact three HTTPS origins approved.
- Backend database marker identity/readiness gate passed.
- Externally networked providers disabled and credentials absent.
- Email disabled/local mock.
- Synthetic run ID generated and attached to every created entity where supported.
- Baseline aggregate counts recorded without sensitive contents.
- Exact cleanup ledger initialized before the first mutation.

## Smoke matrix

| ID | Check | Method | Procedure | Expected result / evidence | Cleanup |
|---|---|---|---|---|---|
| SM-001 | Storefront load | BA + HTTP | Open fixed storefront origin and request `/` | HTTPS 200; no console fatal; expected release marker; no unapproved request | None |
| SM-002 | Admin load | BA + HTTP | Open fixed admin origin and request `/` | HTTPS response; expected release marker; login guard behaves; no preview redirect | None |
| SM-003 | HTTPS redirect | HTTP + BA | Request HTTP form of all three approved origins | Redirects to matching HTTPS origin without untrusted-host reflection | None |
| SM-004 | Secure cookies | BA + HTTP | Establish auth/CSRF cookie flow and inspect attributes | Refresh cookie HttpOnly, Secure, host-only, approved SameSite; CSRF cookie Secure and approved scope; no token in browser storage | Revoke session |
| SM-005 | Customer login | BA | Login with approved synthetic customer | Access token returned through supported API contract and held in memory only; refresh cookie set | Logout/revoke |
| SM-006 | Token refresh | BA + HTTP | Expire/clear memory token and invoke supported refresh path | New access token issued; refresh rotation succeeds; no refresh token in JSON/storage | Revoke session |
| SM-007 | Logout | BA + HTTP | Invoke logout then retry refresh/protected request | Session revoked, refresh cookie cleared, subsequent refresh rejected | Confirm no active session |
| SM-008 | CSRF accepted origin | HTTP + BA | Submit protected cookie mutation from approved storefront/admin Origin with valid CSRF pair | Accepted subject to auth/authorization | Reverse mutation or clean record |
| SM-009 | CSRF rejected origin | HTTP | Send same shape from `https://unknown.example.invalid` | Canonical CSRF rejection; no mutation | Verify no count change |
| SM-010 | CORS accepted storefront | HTTP + BA | Preflight/request with approved storefront Origin and credentials | Exact allow-origin, credentials permitted, no wildcard | None |
| SM-011 | CORS accepted admin | HTTP + BA | Preflight/request with approved admin Origin and credentials | Exact allow-origin, credentials permitted, no wildcard | None |
| SM-012 | CORS rejected unknown | HTTP | Preflight/request from reserved invalid unknown origin | No CORS approval; no reflected wildcard/origin | None |
| SM-013 | Customer registration | BA + HTTP + DB | Register unique synthetic staging identity | Account created under run ID; no outbound email; no real PII | Delete/revoke only recorded synthetic account through approved cleanup |
| SM-014 | Product read | BA + HTTP | Browse list/detail using an existing synthetic/catalog fixture | Correct read response; no mutation | None |
| SM-015 | COD flow | BA + HTTP + DB | If owner approved COD for smoke, create synthetic order/payment using supported checkout contract; otherwise verify method unavailable | Approved path reaches expected local status with server totals; or deterministic disabled result | Cancel/clean exact order/payment IDs |
| SM-016 | Manual bank-transfer flow | BA + HTTP + DB | If approved, create synthetic manual transfer flow using public display metadata only | No credential/provider call; expected pending-review state | Clean exact order/payment/submission IDs |
| SM-017 | Raast flow | BA + HTTP + DB | If approved, create synthetic manual Raast instruction/submission flow | No external API call; expected manual pending-review state | Clean exact order/payment/submission IDs |
| SM-018 | Customer self-review rejection | HTTP + BA | As customer, attempt the privileged manual-payment review transition | Authorization rejection; payment state unchanged | Verify unchanged state |
| SM-019 | Authorized admin review | BA + HTTP + DB | As approved least-privilege admin, review one synthetic manual submission | Allowed transition follows supported state machine and audit path | Reverse only if supported; otherwise clean exact synthetic records |
| SM-020 | Disabled Stripe rejection | HTTP + BA | Request Stripe availability/operation without credentials | Unavailable/disabled response; no Stripe SDK/API request | None |
| SM-021 | Disabled JazzCash rejection | HTTP + BA | Request JazzCash availability/operation | Unavailable/disabled response; no provider request | None |
| SM-022 | Disabled Easypaisa rejection | HTTP + BA | Request Easypaisa availability/operation | Unavailable/disabled response; no provider request | None |
| SM-023 | Historical provider metadata read | BA + HTTP | Read approved synthetic historical payment metadata | Metadata remains readable without provider initialization or credential | None |
| SM-024 | Backend health | HTTP + OP | Request `/api/health`; compare with independent operator readiness/marker evidence | Liveness 200 is recorded but not mistaken for database readiness | None |
| SM-025 | Raw webhook boundary | HTTP + OP | Send a small synthetic `application/json` body to `/api/payments/webhook/<disabled-test-provider>` with no external callback; inspect sanitized result and route ordering evidence | Request remains Buffer at verification boundary; deterministic validation/disabled-provider rejection; no provider API call | Confirm no webhook/payment mutation |
| SM-026 | Exact synthetic cleanup | BA + HTTP + DB + OP | Use cleanup ledger of exact IDs created by this run | Only listed synthetic records/sessions removed; related counts reconcile | This is the cleanup |
| SM-027 | Post-cleanup marker verification | DB + OP | Re-run exact staging marker identity check and aggregate comparison | Marker unchanged; production forbidden; unrelated collection counts unchanged | None |

## Conditional payment-method rule

The owner decision may keep all payment methods disabled. In that case SM-015 through SM-017 verify deterministic unavailability and create no records. If a manual/local method is approved for smoke, only that method is enabled, no external credential is supplied, and it is disabled again after the test.

Stripe, JazzCash, and Easypaisa remain disabled in every case.

## Browser storage checks

Automation must examine:

- `localStorage`;
- `sessionStorage`;
- accessible cookies;
- network responses;
- reload behavior.

No access token or refresh token may persist in local/session storage. The refresh token must never appear in JSON or JavaScript-accessible cookies.

## Network capture checks

Capture destinations and classifications without sensitive headers/bodies:

- approved storefront/admin/backend origins;
- approved static/image/font origins;
- unexpected DNS/HTTP destinations;
- provider SDK/API destinations;
- SMTP/email/analytics/geolocation destinations.

Any Stripe, JazzCash, Easypaisa, SMTP, analytics, marketing, production API, or unknown request is a hard stop.

## Cleanup ledger

Before each mutation, record:

- smoke run ID;
- entity type;
- exact synthetic entity ID after creation;
- owning synthetic customer/admin;
- expected related records;
- pre-count and expected post-count;
- supported cleanup operation;
- cleanup result.

Broad filters, collection drops, database drops, `--drop`, production cleanup, and deletion by non-unique labels are forbidden.

## Final smoke acceptance

- All unconditional checks pass.
- Conditional local payment checks match the owner-approved policy.
- Auth tokens and cookies satisfy the P4 contract.
- CORS/CSRF reject unknown origins.
- External providers/email remain inactive.
- Raw webhook boundary is intact.
- Exact cleanup completes.
- Staging identity marker and unrelated aggregate counts remain unchanged.
- Monitoring/log review contains no secret or sensitive payload.
- Deployment approval owner signs the result.


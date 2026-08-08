# P2 Payment Stabilisation Report

Status: **P2 CODE STABILISATION PASSED — EXTERNAL STRIPE SANDBOX VERIFICATION BLOCKED**

This status means the local code, contract, security, concurrency, and regression
criteria passed. It is not a claim of full external or production payment
verification.

## 1. Post-P1 Recovery Checkpoint

- The post-P1 dirty working tree was captured before Payment source edits.
- Status snapshot: `docs/P2_PRE_PAYMENT_GIT_STATUS.txt`.
- Binary-capable patch: `docs/P2_PRE_PAYMENT_WORKING_TREE.patch`.
- Patch size: 75,322,898 bytes.
- Patch SHA-256:
  `7034CC1C427C8A9D21FD672915830D5239011D9BCEE767BAE8F911A73C6CA278`.
- External backup:
  `C:\MevaPur-Backups\mevaPur-post-p1-pre-payment-20260727-145551`.
- Robocopy exit code: 1, which is a successful copy-with-files-copied result.
- Copy result: 652 files, zero failures.
- Stable first-party SHA-256 comparison: 443/443 matched.
- Existing verified MongoDB dump remains at
  `C:\MevaPur-Backups\mongodb-pre-p0-20260727-115109`.
- The Atlas database and its indexes were not mutated during P2.
- Full checkpoint evidence is in
  `docs/P2_PAYMENT_RECOVERY_CHECKPOINT.md`.

## 2. Baseline Before Payment Changes

The pre-change baseline was:

| Area | Baseline result |
|---|---|
| Backend | 10/10 suites and 72/72 tests passed |
| P0 Auth | 5/5 suites and 23/23 tests passed |
| P1 Order | 5/5 suites and 49/49 tests passed |
| Backend syntax | 145/145 JavaScript files passed |
| Relative imports | 6 pre-existing unresolved imports |
| Error codes | 0 unresolved references |
| Storefront TypeScript | Passed |
| Storefront lint | 33 errors and 35 warnings |
| Storefront build | Passed |
| Admin TypeScript | 8 pre-existing unrelated errors |
| Admin lint | 101 errors and 104 warnings |
| Admin build | Passed while explicitly skipping type validation |
| Retired payment endpoint calls | 0 |

Exact pre-change evidence is in `docs/P2_PAYMENT_BASELINE_RESULTS.md`.

## 3. Active Payment Relationship Map

The active stabilised flow is:

```text
Storefront checkout
  -> POST /api/orders (P1 Order idempotency)
  -> authoritative Order
  -> POST /api/payments (separate Payment idempotency)
  -> paymentController
  -> PaymentService
  -> short local claim/commit
  -> StripeProvider outside the transaction
  -> short provider-result persistence
  -> Stripe PaymentElement
  -> /payment-result
  -> backend Payment/Order polling

Stripe webhook
  -> /api/payments/webhook/stripe
  -> express.raw()
  -> Stripe signature verification
  -> PaymentWebhookEvent unique ledger
  -> PaymentService reconciliation transaction
  -> Payment + Order

Admin refund
  -> POST /api/payments/:id/refunds
  -> protect + admin
  -> RefundService
  -> short amount reservation
  -> Stripe refund outside the transaction
  -> short Refund + Payment + Order reconciliation
```

The pre-change and canonical contracts are documented in
`docs/P2_PAYMENT_CONTRACT_MAP.md`.

## 4. Canonical Payment Contract

The active create contract is:

```text
POST /api/payments
Authorization: Bearer <memory-only access token>
Idempotency-Key: <separate payment request key>
```

```json
{
  "orderId": "MongoDB ObjectId",
  "provider": "stripe"
}
```

Strict validation rejects unknown client amount, currency, total, status, owner,
and provider-object fields. `PaymentService` derives ownership, payable amount,
currency, payment method, and eligibility from the P1 Order.

Responses use the existing canonical `success`, `data`, and `meta.requestId`
envelope. Payment model transforms do not expose request hashes, provider
idempotency data, raw provider responses, secrets, or card data.

## 5. Files Changed

The following 24 pre-existing files were changed during P2:

- `admin-panel/src/app/refunds/page.tsx`
- `admin-panel/src/components/layout/Sidebar.tsx`
- `admin-panel/src/types/index.ts`
- `backend/constants/errorCodes.js`
- `backend/controllers/paymentController.js`
- `backend/controllers/refundController.js`
- `backend/models/Order.js`
- `backend/models/Payment.js`
- `backend/models/Refund.js`
- `backend/routes/paymentRoutes.js`
- `backend/routes/refundRoutes.js`
- `backend/services/payment/PaymentProvider.js`
- `backend/services/payment/PaymentService.js`
- `backend/services/payment/providers/JazzCashProvider.js`
- `backend/services/payment/providers/StripeProvider.js`
- `backend/services/payment/stateMachine/PaymentStateMachine.js`
- `backend/tests/unit/contracts/checkout-order.contract.test.js`
- `frontend/src/app/checkout/page.tsx`
- `frontend/src/components/checkout/PaymentModal.tsx`
- `frontend/src/components/checkout/StripePaymentForm.tsx`
- `frontend/src/lib/payments/jazzcash.ts`
- `frontend/src/lib/payments/stripe.ts`
- `frontend/src/services/order.service.ts`
- `frontend/src/services/payment.service.ts`

`backend/models/Order.js` received only the necessary
`PartiallyRefunded` payment-status relationship. P1 `OrderService`,
`InventoryService`, and `CouponService` business logic was not changed.

## 6. Files Created

The following 17 P2 files were created, including this report:

- `backend/config/payment.config.js`
- `backend/constants/paymentConstants.js`
- `backend/models/PaymentWebhookEvent.js`
- `backend/services/payment/RefundService.js`
- `backend/tests/integration/payment.integration.test.js`
- `backend/tests/unit/contracts/checkout-payment.contract.test.js`
- `backend/tests/unit/models/payment.model.test.js`
- `backend/tests/unit/services/stripe.provider.test.js`
- `backend/validators/paymentValidator.js`
- `docs/P2_PRE_PAYMENT_GIT_STATUS.txt`
- `docs/P2_PRE_PAYMENT_WORKING_TREE.patch`
- `docs/P2_PAYMENT_BASELINE_RESULTS.md`
- `docs/P2_PAYMENT_CONTRACT_MAP.md`
- `docs/P2_PAYMENT_INDEX_MIGRATION.md`
- `docs/P2_PAYMENT_RECOVERY_CHECKPOINT.md`
- `docs/P2_PAYMENT_STABILISATION_REPORT.md`
- `frontend/src/app/payment-result/page.tsx`

No project file was deleted, moved, or renamed.

## 7. Provider Configuration

`backend/config/payment.config.js` now:

- requires a configured Stripe secret before provider use;
- rejects live-mode credentials outside production;
- rejects test-mode credentials in production;
- validates the expected Stripe secret and webhook-secret prefixes without
  logging either value;
- supplies stable operational error codes;
- keeps JazzCash unavailable.

The Payment schema restricts currency to the declared
`SUPPORTED_PAYMENT_CURRENCIES` set, currently `PKR`. Tests use injected fake
test clients only when `NODE_ENV=test`.

## 8. Payment Model and Retention

`backend/models/Payment.js` now represents a retained financial record:

- the unsafe `expiresAt` TTL was removed from the schema;
- completed, failed, partially refunded, and refunded records are not
  TTL-expirable;
- Stripe PaymentIntent identity uses a unique sparse
  `{ provider, providerPaymentId }` index;
- local idempotency uses unique `{ user, idempotencyKey }`;
- paid, refunded, and reserved amounts are explicit;
- provider claim/lease and deterministic provider idempotency fields support
  crash recovery;
- state history and timestamps are declared;
- sensitive compatibility fields remain hidden for safe historical reads;
- raw provider responses and persisted client secrets are no longer part of
  the active write contract.

No Atlas index was changed. Controlled future index deployment and rollback are
documented in `docs/P2_PAYMENT_INDEX_MIGRATION.md`.

## 9. Stripe PaymentIntent Creation

The installed SDK is Stripe 22.3.2. `StripeProvider` now calls:

```text
paymentIntents.create(
  {
    amount,
    currency,
    automatic_payment_methods,
    metadata: { paymentId, orderId, environment }
  },
  { idempotencyKey }
)
```

The unsupported top-level `paymentId` parameter was removed. Amount is converted
deterministically to minor units, currency comes from the authoritative Order,
and safe internal identifiers are strings in metadata. Provider errors are
converted to a generic stable application error without returning the raw
Stripe error.

## 10. Payment Idempotency

The local and provider layers are both idempotent:

- a required Payment idempotency key is separate from the P1 Order key;
- the key is scoped by authenticated user and checked against a canonical
  request hash;
- same key plus same request returns the same Payment safely;
- same key plus changed request returns a conflict;
- an atomic provider claim prevents two workers from creating two
  PaymentIntents;
- Stripe receives a deterministic provider idempotency key;
- stale claims can be recovered after a bounded lease;
- a provider-success/local-persistence-failure retry reconciles the same
  provider object rather than creating another.

Sequential replay, conflicting replay, concurrent duplicate create, provider
failure, and provider-success/local-failure recovery all passed.

## 11. External Call and Database Consistency

No Stripe network operation is held inside a long MongoDB transaction.

The implemented sequence is:

1. short transaction/atomic operations validate the Order and claim one Payment;
2. Stripe create/retrieve runs outside the transaction;
3. short persistence operations store the safe provider result and release the
   claim;
4. provider failure leaves the Order unpaid and records recoverable Payment
   state;
5. retries use the same internal and provider idempotency identities.

Failure-injection tests cover provider failure, database persistence failure
after provider success, and deterministic recovery.

## 12. Webhook Ledger and Deduplication

`PaymentWebhookEvent` provides a persistent unique
`{ provider, providerEventId }` ledger. It stores a payload hash and safe
processing metadata, not the raw payload.

Processing guarantees:

- signature verification happens against the raw Buffer before ledger use;
- invalid signatures return 400;
- accepted duplicate events return a safe 2xx;
- simultaneous duplicate delivery applies business state once;
- processing uses a bounded claim lease and attempt count;
- unsupported valid events are recorded and acknowledged;
- transient failures are recorded and return a non-2xx response so Stripe can
  retry;
- replay after a prior transient failure is supported;
- malformed or relationship-mismatched events cannot create arbitrary
  Payments.

All corresponding focused tests passed.

## 13. Payment and Order State Reconciliation

The canonical Payment states are:

```text
Pending -> Processing -> Completed -> PartiallyRefunded -> Refunded
Pending/Processing -> Failed or Cancelled
```

All written status, history, claim, and timestamp fields exist in the schema.
Invalid transitions are rejected and out-of-order terminal events do not
regress successful state.

A verified success event validates provider ID, internal metadata, amount, and
currency, then updates Payment and Order within one MongoDB transaction. The
Order uses `payment.status`, `payment.transactionId`,
`payment.paymentIntentId`, and `payment.paidAt`; client confirmation cannot
write these server states.

## 14. Refund Authorization and Consistency

Provider refund creation is now only:

```text
POST /api/payments/:id/refunds
protect -> admin -> strict validation -> RefundService
```

The old customer-owner provider-refund route and manual Refund status mutation
route are not active. Refunds require a distinct idempotency key, a positive
bounded amount, a bounded reason, and an eligible completed/partially-refunded
Payment.

`RefundService` atomically reserves refundable amount before the provider call.
This prevents concurrent refunds from exceeding captured amount. It supports
multiple partial refunds, keeps failed refund attempts from changing a
successful Payment to `Failed`, and transactionally reconciles Refund, Payment,
and Order after success. It contains no inventory restoration.

Authorization, zero/excess amount, partial/full/multiple refunds, idempotent
replay, concurrent over-refund, provider failure, and webhook completion tests
passed.

## 15. Storefront Payment Flow

The active checkout now:

- preserves P1 Order creation;
- skips Stripe for COD and shows the Order with pending payment;
- submits only `orderId` and `provider` to `POST /api/payments`;
- keeps a separate random Payment idempotency key in component memory across
  retries;
- uses Stripe PaymentElement;
- does not collect PAN, CVV/CVC, or PIN in the active flow;
- keeps the client secret in React memory only;
- prevents duplicate PaymentElement submission;
- does not treat `confirmPayment` as final payment success;
- navigates to `/payment-result`;
- polls backend Payment and Order state;
- shows completion only when Payment is `Completed` and Order is `Paid`;
- sanitizes unexpected Stripe redirect query parameters from browser history;
- does not call retired endpoints.

The cart is cleared after the Payment submission handoff, while payment retry
continues against the existing Order and Payment rather than creating a new
Order.

## 16. Admin Payment/Refund Flow

The `/refunds` admin page now:

- consumes canonical Payment and Refund envelopes;
- displays Payment, Order payment status, provider, and safe provider reference;
- displays paid/refunded/remaining amounts and partial/full state;
- submits refunds through the admin-authorized canonical endpoint;
- uses a separate in-memory refund idempotency key;
- prevents duplicate submission;
- validates remaining refundable amount;
- does not expose client secrets or raw provider data;
- has no manual Refund status mutation.

The sidebar now labels this area “Payments & Refunds”.

## 17. JazzCash Status

JazzCash is **BLOCKED AND UNAVAILABLE**.

The provider consistently returns a stable unavailable error. It has no fake
redirect, fake success, placeholder signature acceptance, storefront selector,
or active admin configuration path. No claim of merchant, sandbox, callback,
status, or refund integration is made.

## 18. Security and Redaction

- Payment, Refund, and webhook-ledger transforms hide internal hashes, leases,
  sensitive compatibility fields, and raw provider material.
- Payment APIs never return Stripe secret keys or webhook secrets.
- The active browser payment files contain zero `localStorage` or
  `sessionStorage` calls.
- Logs contain safe IDs and outcome/error codes, not client secrets, raw webhook
  bodies, provider responses, authorization headers, cookies, or card data.
- The raw webhook route remains mounted before `express.json()`.
- Final production-like secret scan covered 34 P2 source/test files and found
  zero matches.
- Runtime `backend/.env`, `frontend/.env.local`, and
  `admin-panel/.env.local` remain untracked/ignored.
- No secret value was printed or written to P2 evidence.

## 19. Tests Added or Updated

Added:

- `backend/tests/unit/models/payment.model.test.js`
- `backend/tests/unit/services/stripe.provider.test.js`
- `backend/tests/integration/payment.integration.test.js`
- `backend/tests/unit/contracts/checkout-payment.contract.test.js`

Updated:

- `backend/tests/unit/contracts/checkout-order.contract.test.js`

The P2 suites contain 30 passing tests covering model retention/redaction,
supported Stripe arguments, authoritative Order data, local/provider
idempotency, concurrency, crash recovery, signed webhook handling, persistent
deduplication, state reconciliation, admin-only refunds, over-refund prevention,
and storefront/admin contracts.

## 20. Commands Executed

Material verification commands included:

```text
npm.cmd test -- --runInBand --watchAll=false
npx.cmd jest <five P0 suites> --runInBand --watchAll=false
npx.cmd jest <five P1 suites> --runInBand --watchAll=false
npx.cmd jest <four P2 suites> --runInBand --watchAll=false
node --check <each first-party backend JavaScript file>
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
```

Read-only scripts also performed:

- relative-import resolution;
- `ERROR_CODES.*` resolution;
- `app.js` import/listening-handle inspection;
- loopback Supertest `/api/health`;
- raw webhook Buffer smoke;
- retired endpoint and browser-storage scans;
- production-like secret scans;
- SHA-256 live/backup comparison;
- environment-file tracking checks;
- sanitized Stripe test-mode diagnostics.

No dependency was installed, removed, or upgraded.

## 21. Backend Test Results

| Run | Suites | Tests | Result |
|---|---:|---:|---|
| Complete backend | 14/14 | 102/102 | PASS |
| Focused P0 Auth | 5/5 | 23/23 | PASS |
| Focused P1 Order | 5/5 | 49/49 | PASS |
| Focused P2 Payment | 4/4 | 30/30 | PASS |

Additional final backend results:

- JavaScript syntax: 154/154 passed.
- Static error codes: 35 referenced, 0 unresolved.
- `app.js`: exports an Express function and opens 0 listening handles.
- Loopback `/api/health`: HTTP 200.
- Raw webhook smoke: HTTP 200 and service received a Buffer.
- Raw webhook mount order: before `express.json()`.
- Retired active frontend payment endpoint matches: 0.
- Browser payment storage matches: 0.
- Relative imports: the same 6 pre-existing legacy/inactive unresolved imports
  remain; no P2 import is unresolved.

All Jest runs rejected inherited `MONGODB_URI` and used a loopback-only
MongoDB Memory Server replica set. No test accessed Atlas.

## 22. Stripe Sandbox Verification

Private inspection found:

- the configured secret has a test-mode prefix;
- a webhook secret is present;
- the storefront publishable key is absent;
- Stripe CLI is not installed.

An isolated real Stripe test-mode PaymentIntent attempt was made without
printing or persisting credentials. Stripe rejected the configured credential
with sanitized result:

```text
StripeAuthenticationError
HTTP 401
provider code: absent
decline code: absent
parameter: absent
```

No PaymentIntent, charge, or live-mode object was created. Because the
configured test credential was rejected, an actual provider-created test
PaymentIntent and genuinely signed external webhook reconciliation could not
be completed. External criteria 32–34 are therefore blocked.

Exact blocker: **the privately configured Stripe test-mode secret is rejected
by Stripe as unauthorized, and the storefront publishable key is absent**.

## 23. Storefront/Admin Type-Check, Lint and Build

| Target | TypeScript | Lint | Build |
|---|---|---|---|
| Storefront | PASS | 33 errors, 35 warnings; unchanged pre-existing debt | PASS, 15 routes |
| Admin | 8 pre-existing unrelated errors | 99 errors, 103 warnings | PASS, 25 routes; type validation explicitly skipped |

The storefront build initially failed in the restricted sandbox because
`next/font` could not reach Google Fonts. A network-enabled retry passed without
source changes.

The admin TypeScript errors remain in unrelated content pages and `TopBar.tsx`.
Admin lint improved from 101 errors/104 warnings to 99 errors/103 warnings; no
lint rule or type error was suppressed. The unsupported `next.config.ts`
`eslint` warning remains.

## 24. Git Diff and Scope Verification

Comparison against the post-P1 external backup, excluding only the same
regeneratable directories, found:

- 24 expected P2 changes to pre-existing files;
- no backed-up first-party file missing from the working tree;
- no file deleted, moved, or renamed by P2;
- protected P0 Auth implementation unchanged except the shared
  `errorCodes.js` receiving additive Payment/Refund codes;
- P1 Order core services unchanged;
- `Order.js` changed only for the necessary partial-refund payment relation;
- Product, Coupon, Inventory, Review, Notification, Content, Report, Return,
  and Laravel business logic unchanged;
- no package or lock file changed by P2;
- no `.env` value changed;
- no live secret detected in the pre-P2 tracked diff or the P2 file scope.

The pre-existing dirty tree and its pre-existing tracked deletions were
preserved; P2 did not create those prior changes.

## 25. Remaining Failures

1. Full external Stripe sandbox proof is blocked by an unauthorized/rejected
   private test secret.
2. The storefront publishable Stripe key is absent, so a browser PaymentElement
   cannot perform a real test-mode confirmation in the current environment.
3. A genuine external signed webhook and duplicate external delivery have not
   been proven.
4. The active Atlas deployment may still contain the legacy Payment TTL/index
   until the reviewed controlled migration is executed later.
5. Six pre-existing inactive/legacy backend relative imports remain unresolved.
6. Storefront repository-wide lint debt remains at 33 errors/35 warnings.
7. Admin has 8 unrelated TypeScript errors and 99 lint errors/103 warnings.
8. Production webhook delivery, alerting, reconciliation jobs, and operational
   replay tooling are not verified.

## 26. Deferred Money/Operations Work

The following work is explicitly deferred:

- coordinated integer-paisa migration across Order, Payment, Refund, reports,
  APIs, and historical data;
- reviewed Atlas index remediation from
  `docs/P2_PAYMENT_INDEX_MIGRATION.md`;
- durable outbox/queue and scheduled provider reconciliation;
- production metrics, alerting, dashboards, and dead-letter/replay tooling;
- credential rotation and valid test-mode browser/webhook proof;
- Redis, Docker, CI/CD, Laravel cleanup, and full Returns redesign.

None of this deferred work was started during P2.

## 27. Rollback Instructions

No rollback was executed. Because the repository was already dirty, do not use
`git reset --hard` or a broad checkout.

For a separately approved targeted rollback:

1. create a new timestamped backup of the current tree;
2. verify the post-P1 checkpoint hash and backup path;
3. restore only the 24 paths in section 5 from
   `C:\MevaPur-Backups\mevaPur-post-p1-pre-payment-20260727-145551`;
4. handle the 17 P2-created files only with explicit deletion/archive approval;
5. do not overwrite P0/P1 files outside the listed P2 paths;
6. run the full 102-test backend baseline, storefront checks, and admin checks;
7. verify raw webhook ordering and no Atlas access;
8. retain all recovery evidence.

## 28. Acceptance-Criteria Table

| # | Criterion | Result |
|---:|---|---|
| 1 | P0 Auth 23/23 | PASS |
| 2 | P1 Order 49/49 | PASS |
| 3 | All P2 Payment tests | PASS, 30/30 |
| 4 | No test connects to Atlas | PASS |
| 5 | Amount/currency only from Order | PASS |
| 6 | Unsupported Stripe parameters removed | PASS |
| 7 | Stripe IDs safe and unique | PASS |
| 8 | Local/provider idempotency | PASS |
| 9 | Provider calls outside long transaction | PASS |
| 10 | No unsafe Payment TTL | PASS in schema; deployment index migration deferred |
| 11 | Raw-Buffer signature verification | PASS |
| 12 | Persistent provider event deduplication | PASS |
| 13 | Duplicate/concurrent event once-only processing | PASS |
| 14 | Transient webhook failure returns non-success | PASS |
| 15 | Payment/Order completion consistency | PASS |
| 16 | Client cannot mark Order paid | PASS |
| 17 | Amount/currency mismatch cannot complete | PASS |
| 18 | Invalid/out-of-order transitions safe | PASS |
| 19 | Customer cannot execute provider refund | PASS |
| 20 | Refund capped to remaining amount | PASS |
| 21 | Concurrent refunds capped to paid amount | PASS |
| 22 | Failed refund preserves successful Payment | PASS |
| 23 | Refund path does not restore inventory | PASS |
| 24 | Client/token secrets absent from browser storage/logs | PASS |
| 25 | JazzCash has no fake-success path | PASS |
| 26 | Retired payment calls remain zero | PASS |
| 27 | Raw webhook before `express.json()` | PASS |
| 28 | Storefront TypeScript/build | PASS |
| 29 | Existing admin type/lint debt reported | PASS |
| 30 | No file deleted, moved, or renamed | PASS |
| 31 | No live secret in P2 Git-diff scope | PASS |
| 32 | Real test-mode PaymentIntent succeeds | BLOCKED: Stripe HTTP 401 authentication rejection |
| 33 | Genuine signed external webhook reconciles state | BLOCKED |
| 34 | Duplicate sandbox webhook is idempotent | BLOCKED externally; local signed integration test PASS |

Criteria 1–31 pass. Criteria 32–34 do not, so the required exact result is:

**P2 CODE STABILISATION PASSED — EXTERNAL STRIPE SANDBOX VERIFICATION BLOCKED**

## 29. Recommended Next Milestone

The single safest next milestone is:

**P2.1 — rotate/configure valid Stripe test-mode secret and publishable keys,
then run one isolated real test PaymentIntent, genuine signed webhook
reconciliation, and duplicate webhook replay against the loopback test
database.**

Do not begin broader infrastructure, Returns redesign, integer-paisa migration,
or UI redesign until this external proof is complete.

# P1 Order Stabilisation Report

## 1. Post-P0 Recovery Checkpoint

P1 Order work began only after the recovery checkpoint passed.

- Pre-change status: `docs/P1_PRE_ORDER_GIT_STATUS.txt`
- Pre-change patch: `docs/P1_PRE_ORDER_WORKING_TREE.patch`
- Patch SHA-256: `D0B739220ADF27AB796CC753C9E354FEF44F1567BDACEAB1108A35BFA4444063`
- Verified external source backup: `C:\MevaPur-Backups\mevaPur-post-p0-pre-order-20260727-134957`
- Stable backup comparison: 10,072/10,072 SHA-256 matches
- Missing, extra, or mismatched stable files: 0
- Verified MongoDB dump retained: `C:\MevaPur-Backups\mongodb-pre-p0-20260727-115109`
- Existing dump/isolated-restore evidence: PASS
- Active Atlas database unchanged by P1: PASS; P1 tests rejected inherited `MONGODB_URI` and used a loopback-only MongoDB memory replica set
- Restore drill repeated in P1: no; existing evidence was complete and non-contradictory

Full checkpoint evidence is in `docs/P1_ORDER_RECOVERY_CHECKPOINT.md`.

## 2. Baseline Before Order Changes

The baseline was captured before Order source edits:

| Area | Pre-P1 result |
|---|---|
| Backend auth tests | 5 suites, 23/23 tests passed |
| Backend JavaScript syntax | 139/139 passed |
| Existing Order tests | none |
| Relative imports | 6 unresolved pre-existing utility/legacy imports |
| Storefront TypeScript | passed |
| Storefront lint | 77 problems: 38 errors, 39 warnings |
| Storefront build | passed after network access for Google Fonts |
| Admin TypeScript | 8 unrelated errors |
| Admin lint | 205 problems: 101 errors, 104 warnings |
| Admin build | passed while explicitly skipping type validation |

Exact baseline evidence is in `docs/P1_ORDER_BASELINE_RESULTS.md`.

## 3. Active Checkout/Order Relationship Map

```text
Storefront checkout
  -> shared P0 API client (access token in memory)
  -> POST /api/orders + Idempotency-Key
  -> orderRoutes
  -> protect authentication
  -> Zod request/header validation
  -> orderController
  -> OrderService
     -> Product authoritative price/variant resolution
     -> CouponService conditional reservation
     -> ShippingService / TaxService
     -> Order creation
     -> InventoryService conditional reservation + journal
  -> one MongoDB transaction
```

Customer and admin reads now consume the same response envelope:

```text
{ success: true, data: { order | orders + pagination }, meta: { requestId } }
```

The pre-change and canonical relationship details are in `docs/P1_ORDER_CONTRACT_MAP.md`.

## 4. Canonical Order Contract

Request:

```json
{
  "items": [
    {
      "productId": "MongoDB ObjectId",
      "quantity": 1,
      "variantId": "optional MongoDB ObjectId"
    }
  ],
  "shippingAddress": {
    "fullName": "Customer Name",
    "phone": "03XXXXXXXXX",
    "address": "Street and area",
    "addressLine2": "optional",
    "city": "Lahore",
    "province": "Punjab",
    "postalCode": "optional",
    "country": "Pakistan"
  },
  "paymentMethod": "cod | stripe",
  "couponCode": "optional",
  "customerNote": "optional"
}
```

Required header:

```text
Idempotency-Key: 8-128 safe characters
```

The client does not send authoritative product names, SKUs, prices, stock, discount, tax, shipping cost, subtotal, or total. Unknown fields, including monetary totals, are rejected.

Success:

```json
{
  "success": true,
  "data": {
    "order": {},
    "idempotentReplay": false
  },
  "meta": {
    "requestId": "opaque"
  }
}
```

Errors use the P0 central `{ success, error: { code, message }, meta }` envelope.

## 5. Files Changed

The post-P0 source backup comparison identifies these 27 P1-modified files:

- `admin-panel/src/app/orders/[id]/page.tsx`
- `admin-panel/src/app/orders/page.tsx`
- `admin-panel/src/lib/api.ts`
- `backend/constants/errorCodes.js`
- `backend/controllers/orderController.js`
- `backend/models/Coupon.js`
- `backend/models/InventoryTransaction.js`
- `backend/models/Order.js`
- `backend/routes/orderRoutes.js`
- `backend/services/order/CouponService.js`
- `backend/services/order/InventoryService.js`
- `backend/services/order/OrderService.js`
- `backend/tests/globalSetup.js`
- `backend/tests/setup.js`
- `backend/validators/orderValidator.js`
- `frontend/src/app/checkout/page.tsx`
- `frontend/src/app/order-success/page.tsx`
- `frontend/src/app/orders/[id]/page.tsx`
- `frontend/src/app/orders/page.tsx`
- `frontend/src/app/products/[id]/page.tsx`
- `frontend/src/components/checkout/PaymentModal.tsx`
- `frontend/src/components/OrderCard.tsx`
- `frontend/src/components/ProductCard.tsx`
- `frontend/src/lib/adminApi.ts`
- `frontend/src/services/order.service.ts`
- `frontend/src/store/cartStore.ts`
- `frontend/src/types/product.ts`

The checkout modal change only removes unsupported payment choices from the active checkout and constrains it to the existing Stripe path. It does not change Stripe execution, PaymentService, a provider, or webhook handling.

## 6. Files Created

P1 created these 12 files:

- `backend/constants/orderConstants.js`
- `backend/tests/integration/order.integration.test.js`
- `backend/tests/unit/contracts/checkout-order.contract.test.js`
- `backend/tests/unit/models/order.model.test.js`
- `backend/tests/unit/services/order.service.test.js`
- `backend/tests/unit/validators/order.validator.test.js`
- `docs/P1_PRE_ORDER_GIT_STATUS.txt`
- `docs/P1_PRE_ORDER_WORKING_TREE.patch`
- `docs/P1_ORDER_RECOVERY_CHECKPOINT.md`
- `docs/P1_ORDER_BASELINE_RESULTS.md`
- `docs/P1_ORDER_CONTRACT_MAP.md`
- `docs/P1_ORDER_STABILISATION_REPORT.md`

## 7. Order Model Changes

`backend/models/Order.js` now provides:

- readable `ORD-YYYYMMDD-<12 hex>` identifiers using cryptographic random bytes;
- an identifier default plus pre-validation safeguard, so validation no longer runs before `orderId` exists;
- a unique `orderId` index and bounded duplicate-key retry in the service;
- immutable per-line product, variant, SKU, label, unit-price, quantity, line-total, and image snapshots;
- canonical `cod`/`stripe` payment methods with initial `Pending` payment status;
- coupon snapshots;
- `Confirmed` status and validated status history with actor, actor role, timestamp, and bounded note;
- user-scoped idempotency key/request hash with a unique compound index;
- cancellation restoration timestamps;
- response transforms that hide idempotency key and request hash.

Money remains decimal `Number` with deterministic two-decimal rounding. Integer-paisa conversion is deliberately deferred because Payment and reporting require a coordinated migration.

## 8. Validation Changes

The active route mounts Zod 4 validation before controllers for:

- authenticated order creation;
- `Idempotency-Key`;
- ObjectId/order-number references;
- customer pagination/status;
- admin status/search/date/sort filters;
- status transition bodies;
- cancellation bodies.

Creation validates non-empty/bounded items, ObjectIds, integer quantities of 1-20, at most 50 lines, duplicate product/variant lines, Pakistani shipping fields, canonical payment methods, coupon/note limits, and strict unknown-field rejection. Zod 4 issues flow through the central validation/error middleware.

## 9. Pricing and Totals

`OrderService` loads active Products within the transaction and resolves the selected or default variant. It uses database name, SKU, price, images, category, and availability. It calculates and rounds:

```text
subtotal
  - coupon discount
  + server shipping
  + server tax
  = final total
```

Client monetary fields fail validation. Integration tests prove a manipulated client price/total cannot determine the persisted amount.

## 10. Inventory and Transactions

Order, coupon, stock, and inventory-journal mutations share one MongoDB session and transaction.

- Stock decrement uses an atomic sufficient-stock predicate.
- Variant stock is decremented through the selected subdocument.
- A default variant also guards and updates mirrored root stock.
- A failed line aborts the transaction.
- Journal entries use unique per-order/product/variant operation keys.
- Transient transaction/write-conflict retries are bounded to three attempts.
- Cancellation restores stock inside a transaction and records one cancellation journal per line.
- Restoration timestamps plus the state transition make cancellation replay safe.

Tests prove two customers cannot oversell one unit, no stock becomes negative, a simultaneous duplicate reserves once, and a forced journal failure rolls back Order, stock, coupon, and journal writes.

## 11. Coupon Consistency

Coupon validation and reservation now enforce:

- existence, active state, start/end dates;
- minimum order amount;
- applicable products/categories;
- percentage/fixed/free-shipping behaviour;
- maximum discount;
- global usage limit;
- per-customer usage limit;
- atomic conditional usage increment.

The Order stores a stable coupon snapshot. Cancellation restores global/customer usage at most once. Tests cover success/snapshot persistence, invalid supplied coupon rejection, concurrent global-limit enforcement, rollback, and cancellation restoration.

## 12. Idempotency

The storefront creates one UUID for a material checkout payload and retains it across retry attempts. The backend:

- scopes keys to the authenticated user;
- hashes canonical sorted lines, address, method, coupon, and note;
- returns the existing Order for an identical replay;
- returns `ORDER_IDEMPOTENCY_CONFLICT` for a changed payload;
- enforces a unique `{ user, idempotencyKey }` index;
- handles concurrent duplicate-key races;
- does not reserve stock, coupon usage, or journal entries twice.

Concurrent integration tests produce one `201`, one replay `200`, one Order, one stock decrement, and one sale journal.

## 13. Status State Machine

Canonical transitions:

```text
Pending -> Confirmed | Cancelled
Confirmed -> Processing | Cancelled
Processing -> Shipped
Shipped -> Delivered
```

Invalid transitions return `ORDER_STATUS_TRANSITION_INVALID`. Only the active admin middleware can call the transition route. Customers can cancel only an owned Pending/Confirmed Order. Repeated cancellation returns the existing cancellation without repeating inventory or coupon restoration. The admin UI now sends canonical `adminNote` and includes the required `Confirmed` step.

Refund/return transitions and provider operations were not added.

## 14. Checkout Changes

The active storefront now:

- sends `productId`, quantity, and optional variant `_id`;
- retains variant identity in cart lines;
- sends the canonical shipping fields;
- sends one retained `Idempotency-Key`;
- blocks duplicate submit clicks;
- offers only COD and Stripe;
- marks JazzCash truthfully unavailable;
- sends no trusted monetary totals;
- shows canonical backend errors safely;
- keeps the cart after failure;
- clears the cart only after confirmed Order creation;
- redirects with the returned Order `_id`;
- uses the shared P0 API client for checkout, confirmation, history, detail, and cancellation;
- reads canonical customer/admin response envelopes;
- calls no retired Order or Payment endpoint.

Static scan result:

```text
RETIRED_FRONTEND_ENDPOINT_CALLS=0
```

## 15. Security and Privacy

- Complete order/shipping request bodies are not logged.
- Order logs contain request ID, user ID, Order ID, event, and safe error code.
- The authenticated user comes from P0 middleware, not the body.
- Customer detail/cancellation enforce ownership.
- Admin transition/list endpoints retain role middleware.
- Search input is length-bounded and regex-escaped.
- Pagination is bounded and deterministic.
- Actual `.env` files remain untracked.
- The Git-diff secret-assignment scan found only the named test-only `JWT_SECRET` fixture in `backend/tests/setup.js`; it is explicitly non-production and no live secret was found or printed.
- Access/refresh tokens are not persisted in `localStorage` or `sessionStorage`; access tokens remain in memory and refresh tokens remain in the HttpOnly cookie contract.
- Tests reject inherited `MONGODB_URI` and accept only `mongodb://127.0.0.1` or `mongodb://localhost`.

## 16. Tests Added or Updated

P1 provides five Order/checkout suites with 49 tests:

- Order model/identifier/schema tests;
- Zod request/header/query validation tests;
- OrderService hash/replay/retry tests;
- transaction-backed Order API integration and concurrency tests;
- static storefront/API/raw-webhook routing contract tests.

Coverage includes authentication/header enforcement, authoritative price, client-total rejection, variant price/stock, mirrored root guard, unavailable/insufficient stock, idempotent replay/conflict, simultaneous duplicate requests, competing customers, coupon success/failure/concurrency, rollback, double cancellation, ownership, pagination, admin permissions, valid/invalid transitions, canonical frontend fields/methods, duplicate-click guard, cart clear timing, retired endpoints, app import, and raw-webhook middleware order.

## 17. Commands Executed

Recovery/baseline:

```text
git status --short --branch
git diff --stat
git diff
robocopy (timestamped external backup)
Get-FileHash -Algorithm SHA256
npm.cmd test -- --runInBand --watchAll=false
node --check (first-party JavaScript)
static relative-import scan
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
```

Focused/final verification:

```text
npx.cmd jest tests/unit/models/order.model.test.js tests/unit/validators/order.validator.test.js tests/unit/services/order.service.test.js tests/integration/order.integration.test.js --runInBand --watchAll=false
npx.cmd jest tests/unit/contracts/checkout-order.contract.test.js --runInBand --watchAll=false
npx.cmd jest tests/integration/order.integration.test.js --runInBand --watchAll=false
npm.cmd test -- --runInBand --watchAll=false
npx.cmd jest __tests__/auth.test.js tests/unit/services/auth.service.test.js tests/unit/services/token.service.test.js tests/integration/auth.integration.test.js tests/e2e/auth.e2e.test.js --runInBand --watchAll=false
node --check (149 first-party JavaScript files)
static relative-import scan
static ERROR_CODES scan
app.js import-without-listen smoke test under NODE_ENV=test
loopback-only application start and /api/health smoke test
retired frontend endpoint scan
token-storage scan
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
post-backup SHA-256 scope comparison
protected Payment/Refund/Return SHA-256 comparison
sanitized Git-diff secret-assignment scan
```

One direct development-mode `app.js` import attempt, without `server.js` loading environment configuration, failed with `JWT_SECRET is required for authentication`. The required isolated import test then passed under `NODE_ENV=test`, and the loopback application health start returned HTTP 200. No port remained open.

The first final storefront build attempt failed only because sandboxed Google Fonts network access was unavailable. The approved network-enabled retry passed without source changes.

## 18. Test Results

Final backend:

| Result | Count |
|---|---:|
| Suites passed | 10/10 |
| Tests passed | 72/72 |
| Failed | 0 |
| Snapshots | 0 |

P0 authentication regression:

| Result | Count |
|---|---:|
| Suites passed | 5/5 |
| Tests passed | 23/23 |
| Failed | 0 |

P1 Order/checkout tests account for 5 suites and 49 tests. The MongoDB memory replica set was loopback-only; no test accessed Atlas.

Expected negative-case requests generate warning/error log lines and 400/401/403/409/500 responses during integration tests. Those are asserted test cases, not suite failures.

## 19. Type-Check, Lint and Build Results

| Target | TypeScript | Lint | Build |
|---|---|---|---|
| Storefront | PASS | FAIL: 68 problems, 33 errors, 35 warnings | PASS: 14 routes |
| Admin | FAIL: 8 pre-existing unrelated errors | FAIL: 205 problems, 101 errors, 104 warnings | PASS: 25 routes; type validation skipped |

Storefront P1 checkout/order files pass TypeScript. The repository-wide lint backlog remains outside P1; the baseline was 77 problems and the final result is 68.

Admin TypeScript still reports only:

- four unsupported `defaultType` props in content pages;
- four missing `TopBar` icon identifiers.

Admin build warnings remain: obsolete `eslint` configuration in `next.config.ts`, and the build skips type validation. No failure was hidden or disabled for P1.

## 20. Git Diff and Scope Verification

Comparison against `C:\MevaPur-Backups\mevaPur-post-p0-pre-order-20260727-134957`:

| Scope check | Result |
|---|---:|
| P1 changed first-party files | 27 |
| P1 created implementation/test/map/report files before this report | 11 |
| Missing/deleted files since checkpoint | 0 |
| Files moved/renamed by P1 | 0 |
| Protected Payment/Refund/Return files matching backup | 12/12 |
| Actual tracked `.env` variants | 0 |
| Live secrets found in Git diff | 0 |
| Unresolved Order error codes | 0 |
| JavaScript syntax | 149/149 passed |

Protected SHA-256 matches include PaymentProvider, PaymentService, StripeProvider, JazzCashProvider, PaymentStateMachine, payment controller/routes/model, and Refund/Return controllers/models.

The raw webhook mount remains before `express.json()` and still uses `express.raw({ type: 'application/json', limit: '1mb' })`.

The six unresolved relative imports are unchanged baseline debt:

- `backend/database/seeders/index.js` -> `../../common/logger`
- `backend/database/seeders/roleSeeder.js` -> `../../common/logger`
- `backend/middleware/authorize.js` -> `../errors/AppError`
- `backend/middleware/rateLimiter.js` -> `../config/security.config`
- `backend/middleware/rateLimiter.js` -> `../errors/AppError`
- `backend/middleware/securityHeaders.js` -> `../config/security.config`

## 21. Remaining Failures

P1 Order acceptance has no failing Order/auth test, TypeScript gate, build gate, syntax gate, error-code gate, or scope gate.

Unrelated repository debt remains:

- six inactive/utility unresolved relative imports listed above;
- duplicate catalogue `slug` index warnings during model loading;
- storefront repository-wide lint: 33 errors and 35 warnings;
- admin TypeScript: 8 errors;
- admin lint: 101 errors and 104 warnings;
- admin build skips type validation and has unsupported configuration warnings;
- no full browser E2E test with a real payment provider;
- decimal money remains pending a coordinated Order/Payment/reporting integer-paisa migration.

## 22. P2 Payment Issues Deliberately Not Implemented

The following were intentionally not implemented in P1:

- JazzCash provider completion; checkout shows it unavailable;
- Stripe sandbox end-to-end payment confirmation;
- provider webhook event-id persistence and duplicate-event idempotency verification;
- payment/order recovery for asynchronous failures;
- production provider configuration validation;
- Payment state-machine redesign;
- refund/provider execution changes;
- coordinated integer-paisa migration;
- Payment/Refund/Return business-logic changes.

These require a separately approved Payment Engine milestone and provider test credentials/sandbox evidence.

## 23. Rollback Instructions

Do not use `git reset --hard` or discard the dirty tree.

1. Preserve the current tree with a new status snapshot and patch.
2. Re-verify `C:\MevaPur-Backups\mevaPur-post-p0-pre-order-20260727-134957`.
3. In an isolated copy, restore only the 27 files listed in section 5 from that backup.
4. Leave P0 authentication files and all unrelated dirty changes untouched.
5. Remove the six new Order implementation/test files only with explicit approval; the documentation files may be retained as evidence.
6. Run the 23 P0 tests, backend syntax/import checks, storefront TypeScript/build, and admin checks.
7. Compare hashes and review the isolated rollback before applying it to the working tree.

No rollback action was performed.

## 24. Acceptance-Criteria Table

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | P0 auth remains 23/23 | PASS | dedicated 5-suite run |
| 2 | New Order tests pass | PASS | 49/49 P1 tests |
| 3 | No test connects to Atlas | PASS | inherited URI rejection + loopback regex |
| 4 | Order validates before save | PASS | model default/pre-validation test |
| 5 | Visa/Mastercard cannot break validation | PASS | removed from selection; rejected by Zod |
| 6 | JazzCash has no false-success path | PASS | disabled UI; rejected Order method |
| 7 | Client totals cannot control totals | PASS | strict rejection + authoritative-price integration test |
| 8 | Variant price/stock handled | PASS | snapshot/decrement/root-guard tests |
| 9 | Concurrent Orders cannot oversell | PASS | two-customer/one-unit test |
| 10 | Failed transaction leaves no partial mutation | PASS | forced journal-failure rollback test |
| 11 | Repeated requests are idempotent | PASS | replay/conflict/concurrent-duplicate tests |
| 12 | Coupon usage cannot exceed limit | PASS | concurrent global-limit test |
| 13 | Invalid status transitions rejected | PASS | admin integration test |
| 14 | Cancellation cannot restore twice | PASS | double-cancel journal/stock/coupon assertions |
| 15 | Ownership and admin permissions enforced | PASS | 403 owner/admin route tests |
| 16 | Order history paginated | PASS | bounded pagination response test |
| 17 | Shipping PII absent from Order logs | PASS | controller/service logging inspection |
| 18 | Storefront matches backend contract | PASS | TypeScript/build + static contract tests |
| 19 | P0 tokens absent from browser storage | PASS | storage scan; memory auth modules |
| 20 | Raw webhook precedes JSON parser | PASS | routing invariant test and static inspection |
| 21 | Payment/Refund/Return implementation untouched | PASS | 12/12 SHA-256 matches |
| 22 | No file deleted/moved/renamed | PASS | checkpoint comparison: 0 missing |
| 23 | No live secret in Git diff | PASS | sanitized scan; test-only fixture only |
| 24 | Storefront TypeScript/build pass | PASS | exact commands passed |
| 25 | Admin unrelated failures reported | PASS | 8 TS errors; 205 lint problems recorded |

P1 Order Engine and Checkout Contract Stabilisation result: **PASSED**.

## 25. Recommended Next Milestone

The single recommended next milestone is **P2 Payment Engine End-to-End Stabilisation**: verify Stripe sandbox creation/confirmation/webhook idempotency and failure recovery, keep JazzCash disabled until its provider is genuinely implemented, and add isolated payment/refund tests. Do not begin it without explicit approval and a fresh recovery checkpoint.

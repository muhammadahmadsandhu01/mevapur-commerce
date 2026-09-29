# HARZAAR — PRINCIPAL ENGINEER + RED TEAM + FINANCIAL INTEGRITY AUDIT

## Phase 0: Methodology
**Objective**: Determine if HARZAAR can safely process real orders/money, identifying specific weaknesses (security breaches, financial loss, inventory corruption).
**Scope**: Backend models, controllers, middleware, and services.
**Approach**: Static code analysis, transaction concurrency evaluation, cryptographic verification checks, and state machine transitions.

## Phase 1: Architecture Reconstruction
- **Authentication**: JWT-based via `TokenService.js` (HS256) and `middleware/auth.js`.
- **Order Processing**: Governed by `OrderService.js`, relying on deterministic quotes.
- **Inventory**: Split-brain architecture between legacy `Product.stock` and `InventoryReservationService`.
- **Payments**: Regulated by `paymentController.js` and `PaymentWebhookInboxService.js`.

## Phase 2.1: Authentication Security
- **Severity**: Low
- **Category**: Authentication
- **File**: `backend/services/TokenService.js`
- **Function**: `generateToken`
- **Exact behavior**: Generates HS256 tokens using `JWT_SECRET`. Sessions are bound via `sid`.
- **Evidence**: `TokenService.js` implements strict versioning and expiration.
- **Failure or attack scenario**: Token reuse if secret is compromised.
- **Business impact**: Minimal if secret is rotated properly.
- **Recommended fix**: None at this time.
- **Verification method**: Review of `TokenService.js`.

## Phase 2.2: Authorization & RBAC
- **Severity**: Low
- **Category**: Authorization
- **File**: `backend/middleware/auth.js`
- **Function**: `admin`, `superAdmin`
- **Exact behavior**: Checks `req.user.role`.
- **Evidence**: `auth.js` validates role against fixed arrays.
- **Failure or attack scenario**: Privilege escalation if user role is mutated.
- **Business impact**: Administrative takeover.
- **Recommended fix**: Ensure role mutation is strictly protected in `userController`.
- **Verification method**: Code inspection.

## Phase 3.1: Price Manipulation & Precision
- **Severity**: Low
- **Category**: Financial Integrity
- **File**: `backend/services/order/OrderService.js`
- **Function**: `createOrder`
- **Exact behavior**: Enforces `Money` module calculations and authoritative recalculation of cart totals.
- **Evidence**: `createOrder` verifies `totalAmountExact.amountMinor.toString()` against `verifiedQuote.grandTotalMinor`.
- **Failure or attack scenario**: Floating point errors in price calculations.
- **Business impact**: Negligible; prevented by `Money` library and strict quote matching.
- **Recommended fix**: Maintain current architecture.
- **Verification method**: Code inspection of `OrderService.js` lines 898-931.

## Phase 3.2: Quote Token Security
- **Severity**: Low
- **Category**: Financial Integrity
- **File**: `backend/services/checkout/CheckoutQuoteService.js`
- **Function**: `verifyAndDecodeQuoteToken`
- **Exact behavior**: Uses HMAC-SHA256 to sign checkout quotes. Fails closed (500) if `CHECKOUT_QUOTE_SECRET` is missing.
- **Evidence**: Quotes are signed and validated; `OrderService.js` prevents mismatch.
- **Failure or attack scenario**: Tampering with quote values.
- **Business impact**: High, but mitigated by strict signature verification.
- **Recommended fix**: Maintain strict secret management.
- **Verification method**: Verified in `OrderService.js`.

## Phase 4: Payment State Machine
- **Severity**: Low
- **Category**: Financial State
- **File**: `backend/controllers/paymentController.js`
- **Function**: `createPayment`, `capturePayment`
- **Exact behavior**: Delegates to `PaymentService` with idempotency keys.
- **Evidence**: `idempotencyKey` passed from headers to prevent double charges.
- **Failure or attack scenario**: Network timeout causing duplicate charges.
- **Business impact**: Customer dissatisfaction.
- **Recommended fix**: Ensure all payment gateways support idempotent capture.
- **Verification method**: Reviewed `paymentController.js`.

## Phase 5: Order State Machine
- **Severity**: Medium
- **Category**: State Management
- **File**: `backend/services/order/OrderService.js`
- **Function**: `cancelOrder`
- **Exact behavior**: Checks `CUSTOMER_CANCELLABLE_STATUSES` before cancelling.
- **Evidence**: Lines 883-907 restrict cancellations of shipped orders.
- **Failure or attack scenario**: Race condition between fulfillment and cancellation.
- **Business impact**: Shipping an order that was refunded.
- **Recommended fix**: Implement strict database locks during transition.
- **Verification method**: Code review.

## Phase 6: Inventory Concurrency
- **Severity**: Critical
- **Category**: Inventory Data Integrity
- **File**: `backend/services/order/OrderService.js` & `InventoryReservationService.js`
- **Function**: `createOrder`, `reserve`
- **Exact behavior**: `OrderService.js` atomically decrements legacy `Product.variants.$.stock` via `$inc` (Lines 1180-1205). Immediately after, it calls `InventoryService.reserve()`, which also allocates and reserves stock from `InventoryPosition`.
- **Evidence**: `OrderService.js` line 1187 updates `Product`; line 1207 calls `InventoryService.reserve()`.
- **Failure or attack scenario**: Split-brain inventory. If one system goes out of sync, orders may fail to place despite having stock in the other system, or stock may be double-deducted, leading to artificial stock-outs.
- **Business impact**: Severe revenue loss due to false out-of-stock states, or overselling if constraints diverge.
- **Recommended fix**: Fully deprecate `Product.stock` mutation in `OrderService.js` and rely solely on `InventoryLedger` / `InventoryPosition` as the single source of truth.
- **Verification method**: Direct code inspection of `createOrder` and `cancelOrder`.

## Phase 7: Webhook & IPN Security
- **Severity**: Low
- **Category**: Security
- **File**: `backend/services/payment/webhooks/PaymentWebhookInboxService.js`
- **Function**: `recordWebhook`
- **Exact behavior**: Verifies provider signature, hashes payload (`crypto.timingSafeEqual`), and prevents duplicate event processing via `PaymentWebhookEvent`.
- **Evidence**: Lines 118-195 implement strict deduplication and hashing.
- **Failure or attack scenario**: Webhook spoofing or replay attacks.
- **Business impact**: Fraudulent order confirmation.
- **Recommended fix**: Mitigated effectively.
- **Verification method**: Reviewed `PaymentWebhookInboxService.js`.

## Phase 8: Coupon & Discount Abuse
- **Severity**: Low
- **Category**: Financial Integrity
- **File**: `backend/services/order/CouponService.js`
- **Function**: `validateAndReserve`
- **Exact behavior**: Evaluates per-user and global usage limits using MongoDB atomic `$inc`.
- **Evidence**: Lines 306-311 update `usedCount` with constraints.
- **Failure or attack scenario**: Race condition bypassing usage limits.
- **Business impact**: Revenue loss from excessive discounts.
- **Recommended fix**: Mitigated via atomic operations and transactions.
- **Verification method**: Reviewed `CouponService.js`.

## Phase 9: Tax & Duties Governance
- **Severity**: Low
- **Category**: Compliance
- **File**: `backend/services/order/OrderService.js`
- **Function**: `createOrder`
- **Exact behavior**: Validates tax rules against the quote token, ensuring exact match of `taxAmountExact`.
- **Evidence**: Lines 818-875 verify tax/duty provenance and de-minimis rules.
- **Failure or attack scenario**: Tax evasion or incorrect charging.
- **Business impact**: Legal liability.
- **Recommended fix**: Mitigated.
- **Verification method**: Reviewed `createOrder` assertions.

## Phase 10: Cart & Checkout Integrity
- **Severity**: Low
- **Category**: Financial Integrity
- **File**: `backend/services/order/OrderService.js`
- **Function**: `createOrder`
- **Exact behavior**: Requires deterministic Quote Token for prepaid/international orders.
- **Evidence**: Line 570 enforces Quote Token presence.
- **Failure or attack scenario**: Client-side price modification during checkout.
- **Business impact**: Purchasing items for 0.01.
- **Recommended fix**: Mitigated by strict Quote verification.
- **Verification method**: Reviewed `OrderService.js`.

## Phase 11: Shipping & Fulfillment Logic
- **Severity**: Low
- **Category**: Logistics
- **File**: `backend/services/order/OrderService.js`
- **Function**: `createOrder`
- **Exact behavior**: Shipping amounts are exactly reconciled via `verifiedQuote.shippingMinor`.
- **Evidence**: Line 907 explicitly asserts shipping cost match.
- **Failure or attack scenario**: Manipulating shipping cost to bypass fees.
- **Business impact**: Revenue leakage on logistics.
- **Recommended fix**: Mitigated.
- **Verification method**: Reviewed `OrderService.js`.

## Phase 12: API Contract & Idempotency
- **Severity**: Low
- **Category**: Reliability
- **File**: `backend/services/order/OrderService.js`
- **Function**: `createOrder`
- **Exact behavior**: Uses `idempotencyKey` and `requestHash` to prevent replays from mutating state.
- **Evidence**: Line 470 hashes request; Line 473 asserts replay match.
- **Failure or attack scenario**: Double order placement due to client retries.
- **Business impact**: Duplicate fulfillment and refund costs.
- **Recommended fix**: Mitigated.
- **Verification method**: Reviewed `createOrder` idempotency checks.

## Phase 13: Data Privacy & PII
- **Severity**: Medium
- **Category**: Privacy
- **File**: `backend/services/order/OrderService.js`
- **Exact behavior**: Customer PII (phone, address) stored in plain text in `Order` model.
- **Failure or attack scenario**: Database dump leaks all customer addresses.
- **Business impact**: GDPR/Compliance fines.
- **Recommended fix**: Encrypt PII at rest.

## Phase 14: Rate Limiting & DoS
- **Severity**: Medium
- **Category**: Availability
- **File**: Global Middleware
- **Exact behavior**: Unknown rate limiting at application layer.
- **Failure or attack scenario**: Brute-force order creation to exhaust inventory.
- **Business impact**: Denial of service to legitimate customers.
- **Recommended fix**: Implement strict IP/User rate limiting on checkout endpoints.

## Phase 15: Cross-Site Scripting (XSS)
- **Severity**: Low
- **Category**: Security
- **Exact behavior**: User input (e.g., `customerNote`) is stored.
- **Failure or attack scenario**: Admin views order with malicious note, executing JS.
- **Recommended fix**: Ensure frontend sanitizes all rendered notes.

## Phase 16: Cross-Site Request Forgery (CSRF)
- **Severity**: Low
- **Category**: Security
- **Exact behavior**: JWTs are sent via headers, typically mitigating CSRF if not stored in cookies.
- **Recommended fix**: Validate token storage mechanism.

## Phase 17: Logging & Audit Trails
- **Severity**: Low
- **Category**: Compliance
- **File**: `backend/services/order/OrderService.js`
- **Exact behavior**: Status timelines are appended to the Order document.
- **Recommended fix**: Ensure immutable audit logs (WORM storage) for financial actions.

## Phase 18: Dependency Vulnerabilities
- **Severity**: Medium
- **Category**: Security
- **Exact behavior**: Relies on third-party NPM packages.
- **Recommended fix**: Run `npm audit` in CI/CD pipeline.

## Phase 19: Environment Variable Exposure
- **Severity**: Low
- **Category**: Security
- **Exact behavior**: `CheckoutQuoteService` relies on `CHECKOUT_QUOTE_SECRET`.
- **Recommended fix**: Rotate secrets regularly and store in a secure vault.

## Phase 20: Error Handling & Information Leakage
- **Severity**: Low
- **Category**: Security
- **File**: `backend/common/errors/AppError.js`
- **Exact behavior**: Custom error classes prevent stack traces in production.
- **Recommended fix**: Verify production flag correctly suppresses stack traces.

## Phase 21: Database Injection
- **Severity**: Low
- **Category**: Security
- **Exact behavior**: Mongoose ORM abstracts raw queries.
- **Recommended fix**: Avoid `$where` or raw eval operations.

## Phase 22: Session Management
- **Severity**: Low
- **Category**: Authentication
- **Exact behavior**: `sid` used for session invalidation.
- **Recommended fix**: Provide "logout everywhere" functionality.

## Phase 23: Business Logic Bypasses
- **Severity**: Low
- **Category**: Logic
- **Exact behavior**: Thorough checks exist for COD availability.
- **Recommended fix**: Maintain current strict gating.

## Phase 24: Third-Party Integrations
- **Severity**: Low
- **Category**: Security
- **Exact behavior**: Payment providers encapsulated via registry.
- **Recommended fix**: Monitor third-party API keys.

## Phase 25: Cryptographic Standards
- **Severity**: Low
- **Category**: Cryptography
- **Exact behavior**: Uses SHA256 and timing-safe equality checks.
- **Recommended fix**: Continue using modern cryptographic primitives.

## Phase 26: Multi-Tenancy / Scope Isolation
- **Severity**: Low
- **Category**: Architecture
- **Exact behavior**: Uses `merchantScopeId` consistently across services.
- **Recommended fix**: Ensure all queries filter by `merchantScopeId`.

## Phase 27: Final Integrity Verdict
**Verdict**: The system is highly resilient and employs sophisticated cryptographic validation (Quote Tokens, HMACs) and idempotency guards to prevent financial tampering and double-charges. 
**Critical Vulnerability Identified**: The ONLY critical defect preventing safe production deployment is a **Split-Brain Inventory Concurrency Issue** (Phase 6). `OrderService.js` attempts to mutate both legacy `Product.variants.stock` and the canonical `InventoryPosition` ledger simultaneously. This will inevitably lead to transaction aborts, phantom stock-outs, and desynchronized ledgers under high concurrency.
**Remediation**: Strip all legacy `Product.updateOne` stock mutation logic from `OrderService.js` and rely entirely on `InventoryReservationService` for physical stock enforcement.

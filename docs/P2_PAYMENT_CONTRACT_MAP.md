# P2 Payment Contract Map

Captured after the P2 baseline and before any P2 Payment source edit.

## Active Runtime Flow

```text
frontend/src/app/checkout/page.tsx
  -> POST /api/orders + P1 Order Idempotency-Key
  -> authoritative P1 Order
  -> frontend/src/components/checkout/PaymentModal.tsx
  -> frontend/src/services/payment.service.ts
  -> POST /api/payments + Payment Idempotency-Key
  -> backend/app.js
  -> backend/routes/paymentRoutes.js
  -> backend/middleware/auth.js
  -> backend/controllers/paymentController.js
  -> backend/services/payment/PaymentService.js
     -> Order
     -> Payment
     -> PaymentStateMachine
     -> StripeProvider
     -> Stripe SDK

Stripe webhook
  -> POST /api/payments/webhook/stripe
  -> express.raw({ type: application/json, limit: 1mb })
  -> paymentController.handleWebhook
  -> StripeProvider.verifyWebhookSignature
  -> PaymentService.handleWebhook
  -> Payment + Order
```

The raw webhook mount in `backend/app.js` is before cookie parsing, `express.json()`, URL encoding, and request sanitizers. The baseline HTTP smoke proved the controller/service receives a `Buffer`.

## Active Routes Before P2

| Method and path | Middleware | Handler | Pre-P2 contract |
|---|---|---|---|
| `POST /api/payments` | `protect` | `createPayment` | body accepts `orderId`, `gateway`, client `amount`, client `currency`; header key is optional |
| `POST /api/payments/webhook/:gateway` | `express.raw()` | `handleWebhook` | public; controller selects a signature header and delegates verification |
| `POST /api/payments/:id/refund` | `protect` | `refundPayment` | any authenticated Payment owner can invoke a provider refund |
| `GET /api/refunds` | `protect`, `admin` | `getRefunds` | legacy Return-linked Refund list |
| `GET /api/refunds/stats` | `protect`, `admin` | `getRefundStats` | legacy aggregate |
| `GET /api/refunds/:id` | `protect`, `admin` | `getRefund` | legacy Return-linked Refund detail |
| `POST /api/refunds` | `protect`, `admin` | `createRefund` | creates a Refund record without provider orchestration |
| `PUT /api/refunds/:id` | `protect`, `admin` | `updateRefundStatus` | directly assigns a supplied status |
| `POST /api/returns/:id/refund` | `protect`, `admin` | `returnController.processRefund` | separate Return workflow; no PaymentService/provider call |

There is no active Payment status/read route, so the storefront cannot reconcile client confirmation with backend Payment state.

## Pre-P2 Create-Payment Contract

Storefront sends:

```json
{
  "orderId": "MongoDB ObjectId",
  "gateway": "stripe",
  "amount": 1234.56,
  "currency": "PKR"
}
```

It sends:

```text
Idempotency-Key: checkout-<orderId>-stripe
```

Controller signature:

```text
createPayment(req, res, next)
  -> PaymentService.createPaymentSession(
       userId,
       orderId,
       gateway,
       clientAmount,
       clientCurrency,
       optionalOrGeneratedKey
     )
```

Service/provider signature:

```text
PaymentService.createPaymentSession(...)
  -> provider.createPayment(amount, currency, orderId, userId, metadata)
```

Response:

```json
{
  "success": true,
  "data": {
    "paymentId": "...",
    "clientSecret": "...",
    "redirectUrl": "...",
    "status": "..."
  }
}
```

Mismatches:

- the client supplies amount and currency;
- the request uses `gateway`, while the approved contract uses `provider`;
- the idempotency header is optional and the controller generates a time-based fallback;
- idempotency is global rather than scoped to authenticated user and Order;
- no canonical request hash detects changed payload reuse;
- no request/header Zod middleware is mounted;
- success lacks the P0/P1 `meta.requestId` envelope;
- client secret is recovered from stored raw provider response on replay;
- the service waits for Stripe inside an open MongoDB transaction.

## Pre-P2 Payment Model

`backend/models/Payment.js` fields:

- `order`, `user`, `gateway`;
- `transactionId` unique/sparse;
- `paymentIntentId` indexed but not unique;
- status enum: `Pending`, `Processing`, `RequiresAction`, `Authorized`, `Captured`, `Completed`, `Failed`, `RefundPending`, `Refunded`, `Cancelled`;
- `amount`, `currency`;
- unbounded raw `providerResponse`;
- global unique `idempotencyKey`;
- `failureReason`;
- single embedded `refundDetails`;
- unstructured `auditLogs`;
- `expiresAt` with `expireAfterSeconds: 1800`.

Critical model mismatches:

- the TTL can delete the entire financial record;
- no request hash, provider idempotency key, claim/attempt status, paid/refunded amount, retry state, completion timestamp, or declared `previousStatus`;
- the state machine writes `completedAt` although it is undeclared;
- audit entries write `previousStatus` although the audit sub-schema does not declare it;
- `paymentIntentId` is not unique;
- raw provider objects are retained;
- no safe JSON transform redacts idempotency/provider data.

## P1 Order Payment Authority

The active P1 Order supplies:

- owner: `order.user`;
- authoritative payable amount: `order.totalAmount`;
- payment method: `order.paymentMethod` (`cod` or `stripe`);
- provider label: `order.payment.provider`;
- currency: `order.payment.currency` (`PKR`);
- payment eligibility context: `order.orderStatus` and `order.paymentStatus`;
- payment fields: transaction ID, PaymentIntent ID, hidden client secret, paid timestamp, and hidden gateway response.

Pre-P2 PaymentService loads the Order and checks ownership/amount, but still trusts client currency and client amount as inputs. It does not enforce `order.paymentMethod === stripe`, a safe Order state, or an existing completed Payment.

Order payment statuses are `Pending`, `Paid`, `Failed`, and `Refunded`; `PartiallyRefunded` is absent. The pre-P2 webhook incorrectly writes a root `paidAt` field rather than `order.payment.paidAt`.

## Stripe SDK Contract Verified Locally

Installed SDK: `stripe` 22.3.2.

Local definitions in `backend/node_modules/stripe/cjs/resources/PaymentIntents.d.ts` define:

```text
paymentIntents.create(params: PaymentIntentCreateParams, options?: RequestOptions)
```

Verified accepted create parameters include:

- required integer `amount`;
- required lowercase `currency`;
- `automatic_payment_methods`;
- `metadata`.

`backend/node_modules/stripe/cjs/lib.d.ts` defines `RequestOptions.idempotencyKey`.

`paymentId` is not a top-level `PaymentIntentCreateParams` member. Pre-P2 `StripeProvider` spreads `{ paymentId }` at the request top level, so its request contract is defective. Internal Payment/Order IDs belong in string metadata, and Stripe idempotency belongs in the second request-options argument.

The installed event type definitions include:

- `payment_intent.processing`;
- `payment_intent.succeeded`;
- `payment_intent.payment_failed`;
- `payment_intent.canceled`;
- `charge.refunded`;
- `refund.created`;
- `refund.updated`;
- `refund.failed`.

P2 will map only events needed by the PaymentIntent/refund implementation.

## Pre-P2 External Call and Recovery Window

Current sequence:

```text
start Mongo transaction
  -> idempotency lookup
  -> load Order
  -> create Payment
  -> call Stripe over network
  -> persist provider data/state
commit transaction
```

Risks:

- a long external wait holds the transaction open;
- concurrent requests can both pass the initial lookup before a unique-key race;
- provider idempotency is absent;
- a Stripe success followed by database persistence failure has no deterministic reconciliation path;
- provider errors are copied into operational messages and raw provider response is stored.

## Pre-P2 Webhook Contract

Positive:

- exact raw bytes reach the webhook handler;
- Stripe `constructEvent` performs signature verification;
- invalid signatures become HTTP 400.

Gaps:

- no persistent provider-event ledger or unique provider-event ID;
- duplicate and simultaneous delivery are not durably deduplicated;
- every valid Stripe event is treated as if `event.data.object` is a PaymentIntent;
- event type, metadata relationship, amount, and currency are not validated;
- Payment and Order updates are not one transaction;
- out-of-order events can regress state or throw;
- missing Payment becomes a logic failure;
- the controller returns HTTP 200 with an error body for internal failures, suppressing Stripe retry;
- no replay after failure, unsupported-event, or concurrent-delivery semantics exist;
- raw payload is not persisted, which is the correct default and will be preserved.

## Pre-P2 State Machine

The state machine and schema share most pre-P2 names, but the lifecycle is broader than the actual PaymentIntent integration. It allows refund failure to transition the original successful Payment to `Failed`. Terminal/out-of-order event handling and partial refunds are absent.

P2 canonical internal states:

```text
Pending
Processing
Completed
Failed
Cancelled
PartiallyRefunded
Refunded
```

Only a verified provider event or approved server-side provider verification may mark a Payment `Completed`. Client confirmation is not authoritative.

## Pre-P2 Refund Model and Routes

`backend/models/Refund.js` is Return-centric:

- required `refundNumber` generated in a `pre('save')` hook after validation;
- required `returnId`, `orderId`, and `customer`;
- amount/currency/method;
- lowercase `pending`, `processing`, `completed`, `failed`, `cancelled`;
- transaction ID, processor, notes, failure reason;
- no Payment relation, provider, provider refund ID, idempotency key/hash, reserved amount, or safe response transform.

`PaymentService.processRefund` does not use the Refund model. It:

- authorizes the Payment owner rather than an admin;
- permits full/default or arbitrary positive controller amount;
- does not cap cumulative refunds;
- has no refund idempotency/concurrency protection;
- calls the provider and stores one embedded refund;
- transitions the original successful Payment to `Failed` if refund execution fails.

The separate Return/Refund controllers do not call PaymentService and can change return/refund status independently. The complete Returns redesign remains outside P2; provider refund orchestration must not restore inventory.

## Storefront Flow Before P2

Active:

- `frontend/src/app/checkout/page.tsx`;
- `frontend/src/components/checkout/PaymentModal.tsx`;
- `frontend/src/components/checkout/StripePaymentForm.tsx`;
- `frontend/src/services/payment.service.ts`;
- shared P0 in-memory-auth Axios client.

Verified positives:

- P1 Order is created first;
- COD skips Stripe and goes directly to Order confirmation;
- Stripe PaymentElement is used;
- duplicate PaymentElement submit is disabled while confirming;
- no project-controlled active input collects PAN, CVV, or PIN;
- client secret remains React state and is not written to browser storage;
- JazzCash is visibly unavailable;
- retired frontend payment endpoint calls: 0.

Mismatches:

- active modal sends client amount/currency;
- client displays its amount as if authoritative;
- payment key is derived from Order/provider rather than a retained random Payment request key;
- `confirmPayment(...).paymentIntent.status === succeeded` immediately calls `onSuccess`;
- checkout then clears the cart and navigates to `order-success`;
- `order-success` fetches the Order once, shows “Order Confirmed,” and does not poll backend Payment state;
- there is no payment-processing/result route;
- Stripe redirect-return parameters are not reconciled;
- retry state exists only inside the modal lifecycle.

Inactive unsafe duplicate:

- `frontend/src/components/PaymentModal.tsx` is referenced only by `frontend/src/app/checkout/backup.tsx`;
- it collects card number, expiry, CVV, JazzCash account data, and PIN in project-controlled inputs;
- it simulates success after a timeout;
- it is not imported by the active checkout and will remain inactive.

Inactive helpers:

- `frontend/src/lib/payments/index.ts`;
- `frontend/src/lib/payments/stripe.ts`;
- `frontend/src/lib/payments/jazzcash.ts`;
- `frontend/src/hooks/useCheckout.ts`.

They retain old Visa/Mastercard/JazzCash/client-amount contracts but have no active checkout import.

## Admin Flow Before P2

- No Payment list/detail page exists.
- Order list/detail pages display only Order payment method and summary payment status.
- The Refund page lists legacy Refund records and expects `processed`, while the model uses `processing`/`completed`.
- The Refund page has no working provider-refund action.
- Admin API uses the P0 memory-only access token and HttpOnly refresh-cookie contract.
- Payment settings are unrelated to the active environment-backed Stripe provider and place gateway credential fields in browser state; they are not provider configuration evidence.

## Canonical P2 Create Contract

```text
POST /api/payments
Authorization: Bearer <memory-only access token>
Idempotency-Key: <8-128 safe characters>
```

```json
{
  "orderId": "MongoDB ObjectId",
  "provider": "stripe"
}
```

The server derives owner, amount, currency, method, Order state, and eligibility from the P1 Order. Unknown fields, including client amount/currency/status/provider IDs, must fail validation.

Canonical response:

```json
{
  "success": true,
  "data": {
    "payment": {
      "id": "internal Payment ID",
      "orderId": "Order ID",
      "provider": "stripe",
      "status": "Pending",
      "clientSecret": "returned only for Stripe confirmation"
    },
    "idempotentReplay": false
  },
  "meta": {
    "requestId": "opaque"
  }
}
```

## Canonical P2 Persistence/Provider Sequence

```text
short Mongo transaction
  -> verify Order authority/eligibility
  -> claim/create internal Payment
  -> enforce local idempotency
commit

outside transaction
  -> Stripe paymentIntents.create(
       supported params,
       { idempotencyKey: deterministic provider key }
     )

short Mongo operation/transaction
  -> persist provider PaymentIntent ID and safe state
  -> release claim
```

A retry uses the same internal Payment and provider idempotency key. If Stripe succeeded before local persistence failed, the retry deterministically retrieves/returns the same provider object.

## Canonical P2 Webhook Sequence

```text
raw Buffer
  -> Stripe signature verification
  -> append/claim PaymentWebhookEvent by { provider, providerEventId }
  -> validate event/object/internal relationship
  -> transactionally reconcile Payment + Order
  -> mark ledger Processed/Ignored
```

No raw event payload is persisted. Duplicate accepted events return safe 2xx; transient unprocessed failures return non-2xx so Stripe can retry.

## Canonical P2 Refund Boundary

Provider refund creation will require:

- `protect` plus canonical `admin` authorization;
- Payment reference;
- positive bounded amount no greater than remaining refundable amount;
- authoritative Payment currency;
- bounded reason;
- separate refund idempotency key;
- an internal Refund record and atomic amount reservation before the provider call;
- provider call outside the database transaction;
- transactional Refund/Payment/Order reconciliation;
- no inventory mutation.

## Active and Inactive Implementations

| Path | Classification | Evidence |
|---|---|---|
| `backend/services/payment/PaymentService.js` | Active, defective | imported by active payment controller |
| `backend/services/payment/providers/StripeProvider.js` | Active, defective | registered by active PaymentService |
| `backend/services/payment/providers/JazzCashProvider.js` | Active registry entry, incomplete | every main operation throws 501; unsafe placeholder signature code exists |
| `backend/services/paymentService.js` | Inactive legacy duplicate | no first-party runtime import |
| `backend/models/Payment.js` | Active | imported by active PaymentService |
| `backend/models/Refund.js` | Active legacy admin/Return ledger | imported by refund controller, disconnected from PaymentService |
| `frontend/src/components/checkout/PaymentModal.tsx` | Active | imported by active checkout |
| `frontend/src/components/checkout/StripePaymentForm.tsx` | Active | imported by active modal |
| `frontend/src/components/PaymentModal.tsx` | Inactive unsafe duplicate | referenced only by checkout backup |
| `frontend/src/app/checkout/backup.tsx` | Inactive backup | not a Next.js route |
| `frontend/src/lib/payments/*` | Inactive duplicate contract | no active checkout import |
| `admin-panel/src/app/refunds/page.tsx` | Active but read-only/inconsistent | App Router page using `/refunds` |

## Mapping Decision

The active P2 scope is one Express/Mongoose/Stripe PaymentIntent path, one durable webhook ledger, one admin-authorized provider refund path, and the active storefront/admin consumers. JazzCash remains unavailable. No source edit is permitted until this map is complete; this document completes that gate.

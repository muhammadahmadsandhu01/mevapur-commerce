# P3 Staging Index Inventory

## Status

**PASS — active schema and actual staging Atlas inventory recorded**

The expected inventory comes from read-only `model.schema.indexes()`
inspection. The actual inventory was read from the independently verified
staging database with the dedicated migration identity.

## Active Schema Summary

| Model | Collection | Declared indexes | Actual indexes | Collection state |
|---|---|---:|---:|---|
| User | `users` | 5 | 0 | Absent |
| Session | `sessions` | 7 | 0 | Absent |
| AuditLog | `auditlogs` | 9 | 0 | Absent |
| Product | `products` | 6 | 0 | Absent |
| Category | `categories` | 2 | 0 | Absent |
| Coupon | `coupons` | 3 | 0 | Absent |
| Order | `orders` | 5 | 0 | Absent |
| InventoryTransaction | `inventorytransactions` | 5 | 0 | Absent |
| Payment | `payments` | 7 | 0 | Absent |
| PaymentWebhookEvent | `paymentwebhookevents` | 2 | 0 | Absent |
| Refund | `refunds` | 8 | 0 | Absent |
| **Total** | 11 collections | **59** | **0** | **0/11 present** |

## Security-Critical Declared Definitions

| Collection | Keys | Expected name/options |
|---|---|---|
| `users` | `{ email: 1 }` | `email_1`, unique |
| `sessions` | `{ expiresAt: 1 }` | `expiresAt_1`, TTL 0 |
| `orders` | `{ orderId: 1 }` | `orderId_1`, unique |
| `orders` | `{ user: 1, idempotencyKey: 1 }` | `unique_user_order_idempotency`, unique |
| `inventorytransactions` | `{ operationKey: 1 }` | `operationKey_1`, unique, sparse |
| `payments` | `{ user: 1, idempotencyKey: 1 }` | `unique_user_payment_idempotency`, unique |
| `payments` | `{ provider: 1, providerPaymentId: 1 }` | `unique_provider_payment_reference`, unique, sparse |
| `payments` | `{ order: 1, createdAt: -1 }` | `order_1_createdAt_-1` |
| `payments` | `{ customerReferenceHash: 1 }` | `unique_manual_customer_reference`, unique, sparse |
| `paymentwebhookevents` | `{ provider: 1, providerEventId: 1 }` | `unique_provider_webhook_event`, unique |
| `refunds` | `{ refundNumber: 1 }` | `refundNumber_1`, unique |
| `refunds` | `{ payment: 1, idempotencyKey: 1 }` | `unique_payment_refund_idempotency`, unique, partial |
| `refunds` | `{ provider: 1, providerRefundId: 1 }` | `unique_provider_refund_reference`, unique, sparse |
| `refunds` | `{ status: 1, createdAt: -1 }` | `status_1_createdAt_-1` |

The Refund idempotency partial filter requires ObjectId `payment` and string
`idempotencyKey`.

## Known Schema-Level Observations

- Payment no longer declares an `expiresAt` TTL.
- Session intentionally declares an `expiresAt` TTL with
  `expireAfterSeconds: 0`.
- Product and Category load still emit duplicate `slug` declaration warnings.
  The schema inventory collapses these to the effective definitions; the
  source duplication remains deferred debt.
- `Payment.provider`, not `providerCode`, is the active canonical field.
- PKR remains the only supported Payment currency.

## Staging Atlas Inventory

| Actual collection | Documents | Indexes | Classification |
|---|---:|---:|---|
| `environment_markers` | 1 | 1 (`_id_`) | Required staging identity metadata |

Actual totals:

- first-party collections: 1;
- documents: 1;
- indexes: 1;
- application model collections present: 0/11;
- application model collections absent: 11/11;
- declared application indexes absent: 59/59.

The 14 security-critical allowlisted indexes are all absent because their
target collections do not yet exist. Creating an index on a missing MongoDB
collection would create that collection. This matters because the approved P3
apply contract requires collection counts to remain unchanged.

The previously documented active-database total of 57 indexes was not queried
or used. It belongs to the separately protected non-staging evidence.

## Final Staging Inventory

The inventory above is the historical state before the separately approved
schema initialization. The authoritative post-migration inventory is:

| Collection | Documents after cleanup | Indexes |
|---|---:|---:|
| `environment_markers` | 1 | 1 |
| `users` | 0 | 2 |
| `sessions` | 0 | 2 |
| `orders` | 0 | 3 |
| `inventorytransactions` | 0 | 2 |
| `payments` | 0 | 5 |
| `paymentwebhookevents` | 0 | 2 |
| `refunds` | 0 | 5 |

The eight-collection immediate post-index state was `8 collections / 1
document / 22 indexes`: eight automatic `_id_` indexes plus the exact 14-index
allowlist.

The approved application smoke later caused Mongoose to materialize 11
additional empty model collections, each with only `_id_`:

`activitylogs`, `auditlogs`, `brands`, `categories`, `contents`, `coupons`,
`notifications`, `products`, `returns`, `reviews`, and `settings`.

After exact synthetic-record cleanup, the final sanitized topology was:

- collections: 19;
- aggregate documents: 1, the marker only;
- aggregate indexes: 33;
- synthetic application documents: 0;
- required allowlisted indexes present: 14/14;
- index conflicts: 0;
- legacy Payment TTL: absent;
- marker: intact.

# P2 Payment Index Migration

Status: **DOCUMENTED — NOT EXECUTED AGAINST ATLAS**

This checkpoint intentionally made no index change on the active database. Production has `autoIndex: false`, so the new payment indexes and removal of the retired TTL must be applied later as a controlled, separately approved maintenance operation.

## Required preconditions

1. Reconfirm the verified recovery dump at `C:\MevaPur-Backups\mongodb-pre-p0-20260727-115109`.
2. Capture active collection counts and current `payments`, `refunds`, and `paymentwebhookevents` indexes.
3. Confirm the deployed application version understands the P2 fields.
4. Run all duplicate checks below read-only and resolve every result before creating a unique index.
5. Schedule a maintenance window and document an operator and rollback owner.

## Read-only duplicate checks

Run these only through a privately authenticated database session. Do not record credentials or document contents.

```javascript
db.payments.aggregate([
  { $match: { user: { $type: "objectId" }, idempotencyKey: { $type: "string" } } },
  { $group: { _id: { user: "$user", key: "$idempotencyKey" }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])

db.payments.aggregate([
  { $match: { provider: { $type: "string" }, providerPaymentId: { $type: "string" } } },
  { $group: { _id: { provider: "$provider", reference: "$providerPaymentId" }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])

db.refunds.aggregate([
  { $match: { payment: { $type: "objectId" }, idempotencyKey: { $type: "string" } } },
  { $group: { _id: { payment: "$payment", key: "$idempotencyKey" }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])

db.refunds.aggregate([
  { $match: { provider: { $type: "string" }, providerRefundId: { $type: "string" } } },
  { $group: { _id: { provider: "$provider", reference: "$providerRefundId" }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])
```

Acceptance: every aggregation returns zero groups.

## Desired P2 indexes

| Collection | Keys | Options |
|---|---|---|
| `payments` | `{ user: 1, idempotencyKey: 1 }` | unique, name `unique_user_payment_idempotency` |
| `payments` | `{ provider: 1, providerPaymentId: 1 }` | unique, sparse, name `unique_provider_payment_reference` |
| `payments` | `{ order: 1, createdAt: -1 }` | name generated or explicitly recorded |
| `paymentwebhookevents` | `{ provider: 1, providerEventId: 1 }` | unique, name `unique_provider_webhook_event` |
| `refunds` | `{ payment: 1, idempotencyKey: 1 }` | unique, partial on ObjectId payment/string key, name `unique_payment_refund_idempotency` |
| `refunds` | `{ provider: 1, providerRefundId: 1 }` | unique, sparse, name `unique_provider_refund_reference` |
| `refunds` | `{ status: 1, createdAt: -1 }` | name generated or explicitly recorded |

## Retired TTL remediation

The P2 Payment schema no longer declares `expiresAt` and must not delete financial records. Before any index removal:

1. Inspect `db.payments.getIndexes()` and record the exact TTL index name and options.
2. Confirm the candidate index is the old `expiresAt` TTL with `expireAfterSeconds: 1800`.
3. Confirm no active deployed application depends on TTL deletion.
4. Remove only that exact verified index in the approved maintenance window.
5. Do not remove payment documents or unset historical fields as part of this operation.

No `dropIndex`, `syncIndexes`, or equivalent command was executed against Atlas during P2.

## Post-change verification

1. Re-read the three collection index lists.
2. Re-run the duplicate checks.
3. Re-run P0, P1, and P2 tests against loopback-only MongoDB.
4. Create one test-mode payment and deliver the same signed test webhook twice.
5. Confirm one webhook-ledger row and one business-state transition.
6. Compare active collection counts with the immediate pre-maintenance baseline, allowing only explicitly created verification records.
7. Retain the recovery dump and the operator log.

## Rollback

If index creation fails, stop without deleting documents. Keep the previous application version available, record the sanitized index error, and restore index definitions only from the captured pre-maintenance index list. Database restoration is a last resort and must use the separately verified recovery procedure; never use `--drop` against the active database.

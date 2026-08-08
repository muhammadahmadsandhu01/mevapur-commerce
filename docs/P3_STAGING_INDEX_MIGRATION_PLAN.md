# P3 Staging Index Migration Plan

> **Final authoritative status: PASS.** The original blocked dry-run is
> retained as evidence; `Current Decision` records the completed apply.

## Historical Gate Status

**IMPLEMENTED — ZERO-MUTATION DRY-RUN BLOCKED APPLY ON ABSENT COLLECTIONS**

Migration script:

```text
backend/scripts/migrations/p3-staging-index-migration.js
```

The script passed `node --check`. Static verification found zero
`syncIndexes`, broad `dropIndexes`, `dropDatabase`, or generic
`process.env.MONGODB_URI` calls.

## Proposed Allowlist Version

`P3-STAGING-INDEX-V1`

The allowlist is a candidate ceiling, not an instruction to create every entry.
After actual staging inventory, the reviewed diff must select the exact subset
that is missing or mismatched.

| Collection | Operation | Keys | Exact expected name/options |
|---|---|---|---|
| `users` | retain/create | `{ email: 1 }` | `email_1`, unique |
| `sessions` | retain/create | `{ expiresAt: 1 }` | `expiresAt_1`, TTL 0 |
| `orders` | retain/create | `{ orderId: 1 }` | `orderId_1`, unique |
| `orders` | retain/create | `{ user: 1, idempotencyKey: 1 }` | `unique_user_order_idempotency`, unique |
| `inventorytransactions` | retain/create | `{ operationKey: 1 }` | `operationKey_1`, unique, sparse |
| `payments` | retain/create | `{ user: 1, idempotencyKey: 1 }` | `unique_user_payment_idempotency`, unique |
| `payments` | retain/create | `{ provider: 1, providerPaymentId: 1 }` | `unique_provider_payment_reference`, unique, sparse |
| `payments` | retain/create | `{ order: 1, createdAt: -1 }` | `order_1_createdAt_-1` |
| `payments` | retain/create | `{ customerReferenceHash: 1 }` | `unique_manual_customer_reference`, unique, sparse |
| `paymentwebhookevents` | retain/create | `{ provider: 1, providerEventId: 1 }` | `unique_provider_webhook_event`, unique |
| `refunds` | retain/create | `{ refundNumber: 1 }` | `refundNumber_1`, unique |
| `refunds` | retain/create | `{ payment: 1, idempotencyKey: 1 }` | `unique_payment_refund_idempotency`, unique, exact partial filter |
| `refunds` | retain/create | `{ provider: 1, providerRefundId: 1 }` | `unique_provider_refund_reference`, unique, sparse |
| `refunds` | retain/create | `{ status: 1, createdAt: -1 }` | `status_1_createdAt_-1` |
| `payments` | conditional remove | `{ expiresAt: 1 }` | exact captured legacy name, TTL 1800 only |

The exact Refund partial filter is:

```text
payment type ObjectId AND idempotencyKey type string
```

## Mandatory Refusal Conditions

A future implementation must exit non-zero before mutation when:

- `APP_ENV`/staging marker is absent;
- database name differs from the approved exact target;
- project or cluster identity differs;
- the authenticated user is not the approved staging migration user;
- a production identity/marker is detected;
- the synthetic staging marker is absent;
- backup evidence is absent or stale;
- pre-migration duplicate/type checks fail;
- allowlist version is absent/unknown;
- selected operations are empty or malformed;
- an existing index with the target name has different keys/options;
- the legacy TTL name/keys/options do not match exactly;
- an allowlisted target collection is absent, because implicit collection
  creation would violate the unchanged collection-count contract.

## Dry-Run Contract

Dry-run must:

1. verify identity without printing credentials/hostnames;
2. verify backup evidence;
3. read collection counts and aggregate document count;
4. read actual index definitions;
5. run all duplicate/type/status checks;
6. compare the actual diff to the allowlist;
7. print only safe collection/index names, operations, and aggregate counts;
8. perform zero mutations;
9. return non-zero for every mismatch.

Current dry-run:

| Check | Result |
|---|---|
| Identity | PASS |
| Backup manifest/hashes | PASS, 3 entries |
| Data checks | PASS, 19/19 zero |
| Current collections/documents | 1 / 1 |
| Retained indexes | 0 |
| Proposed creates ready to apply | 0 |
| Blocked creates | 14/14, target collection absent |
| Conflicting definitions | 0 |
| Conditional legacy removal | None; `payments` absent |
| Index/document/collection mutations | 0 / 0 / 0 |
| Production access | None |
| Corrected dry-run exit code | `3` (`BLOCKED`) |

The first invocation stopped locally with `BACKUP_MANIFEST_INVALID` because the
PowerShell-created UTF-8 manifest contains a BOM. No database connection or
mutation occurred. The parser was made BOM-safe, syntax revalidated, and the
second invocation reached the reviewed zero-mutation result above.

## Apply Contract

Only an approved apply mode may:

- call `createIndex` with explicit name and exact options;
- drop only the exact verified legacy Payment TTL index;
- verify after every operation;
- stop immediately on mismatch;
- preserve all documents and collections;
- rerun safely with no duplicate unsafe work.

Broad `syncIndexes`, `dropIndexes`, collection deletion, database deletion, and
document mutation are prohibited.

## Idempotency

Second execution must compare keys/options by canonical form. A matching index
is retained without recreation. A name collision with different keys/options
is a hard failure. An already absent approved legacy TTL is retained as absent
only when post-state matches the allowlist.

## Current Decision

- Migration implementation created: Yes
- Fresh post-initialization backup accepted: Yes, 17/17 hashes verified
- Final dry-run executed: Yes, exit `0`
- Data checks: 19/19 PASS
- Apply executed: Yes, only against isolated staging
- Indexes created: 14
- Indexes removed: 0
- Blocked/conflicting operations: 0/0
- Immediate post-apply state: 8 collections, 1 document, 22 indexes
- Second apply: exit `0`, 14 retained, 0 created
- Document/collection mutations during index apply: 0/0
- Production accessed: No

The earlier blocked dry-run table is retained as historical gate evidence. The
migration backup gate was subsequently tightened to accept only a verified
`mongodb-staging-post-schema-init-<timestamp>` dump containing the exact eight
expected BSON/metadata collection pairs.

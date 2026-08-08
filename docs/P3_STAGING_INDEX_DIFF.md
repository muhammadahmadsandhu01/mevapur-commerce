# P3 Staging Index Diff

> **Final authoritative status: PASS.** The original blocked diff below is
> retained as gate history; `Final Applied Diff` records the completed state.

## Historical Gate Status

**REVIEWED — data-compatible creates identified, but apply is blocked by
absent application collections**

## Comparison Boundary

Available evidence:

- active Mongoose schema inventory: 59 declared indexes across 11 required
  models;
- P2 documented desired Payment/Webhook/Refund indexes;
- P2.2 manual-reference uniqueness requirement;
- historical documentation that an active deployment may retain a legacy
  Payment TTL;
- actual staging collection/index inventory;
- 19/19 aggregate compatibility checks;
- verified staging dump and isolated restore.

Actual staging contains only `environment_markers` with its `_id` index. All 11
application collections are absent.

## Conditional Classification

| Candidate | Classification | Current decision |
|---|---|---|
| User email unique | required create; data check passed | BLOCKED: `users` absent |
| Session expiry TTL | required create | BLOCKED: `sessions` absent |
| Order ID unique | required create; data check passed | BLOCKED: `orders` absent |
| Order user/idempotency unique | required create; data check passed | BLOCKED: `orders` absent |
| Inventory operation-key unique | required create; data check passed | BLOCKED: target absent |
| Payment user/idempotency unique | required create; data check passed | BLOCKED: `payments` absent |
| Payment provider/reference unique | required create; data/type checks passed | BLOCKED: `payments` absent |
| Payment order/created lookup | required create | BLOCKED: `payments` absent |
| Payment manual-reference unique | required create; data/type checks passed | BLOCKED: `payments` absent |
| Webhook provider/event unique | required create; data check passed | BLOCKED: target absent |
| Refund number unique | required create; data check passed | BLOCKED: `refunds` absent |
| Refund idempotency unique | required create; data/type checks passed | BLOCKED: `refunds` absent |
| Refund provider/reference unique | required create; data/type checks passed | BLOCKED: `refunds` absent |
| Refund status/created lookup | required create | BLOCKED: `refunds` absent |
| Payment `expiresAt` TTL 1800 | conditional remove | NOT PRESENT; no removal |
| Product/Category duplicate slug declarations | duplicate/redundant source debt | DEFERRED |
| Remaining 45 declared schema indexes | outside P3 critical allowlist | DEFERRED |

## Legacy Payment TTL Rule

Removal is allowed only if staging inspection proves one exact index:

- collection: `payments`;
- key: `{ expiresAt: 1 }`;
- TTL: `expireAfterSeconds: 1800`;
- exact name captured before the operation;
- no other key/option difference;
- fresh verified staging backup exists.

The `payments` collection is absent, so the legacy TTL is also absent. No
removal is proposed. A later appearance of any differently defined TTL remains
a hard failure.

## Collection-Preservation Gate

MongoDB creates a collection when `createIndex` targets a missing collection.
Applying the 14 creates now would increase the collection count and violate the
explicit P3 requirement that collection counts remain unchanged. The migration
must therefore refuse apply until the seven allowlisted target collections
exist through an independently approved synthetic schema-initialization step.
No such step is authorized in this milestone.

## Result

- Required creates confirmed from actual staging diff: 14
- Required modifications confirmed: 0
- Required removals confirmed: 0
- Safe existing application indexes confirmed: 0
- Blocked creates: 14/14
- Conditional legacy removals: 0; target/index absent
- Deferred schema indexes outside allowlist: 45
- Atlas operations executed: 0

## Final Applied Diff

The blocked state above is retained as historical evidence. After the separate
schema initialization and verified fresh backup/restore, the diff was rerun:

| Final diff property | Result |
|---|---:|
| Target collections present | 7/7 |
| Data checks | 19/19 PASS |
| Required creates | 14 |
| Existing retained before first apply | 0 |
| Blocked creates | 0 |
| Conflicts | 0 |
| Legacy TTL removals | 0; exact candidate absent |
| Deferred indexes outside allowlist | unchanged |

Apply created exactly the 14 listed indexes. The second apply retained all 14,
created `0`, removed `0`, blocked `0`, and exited successfully. No document or
collection mutation occurred during index apply. This final section is the
authoritative status.

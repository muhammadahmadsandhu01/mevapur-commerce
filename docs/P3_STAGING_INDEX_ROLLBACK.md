# P3 Staging Index Rollback

> **Final authoritative status: PASS.** The original not-applicable snapshot
> is historical; `Current Result` records the completed rollback proof.

## Historical Gate Status

**NOT APPLICABLE — dry-run made zero index mutations**

Staging identity, backup, restore, inventory, and data gates passed. The dry-run
blocked all creates before mutation because the target collections are absent.
There is therefore no created or removed index to reverse safely.

## Rollback Principles

- Prefer an index-specific forward correction.
- Never use database restore as the normal first response.
- Never use broad `dropIndexes` or `syncIndexes`.
- Never delete documents to make an index operation succeed.
- Operate only on the approved staging project/cluster/database.
- Require the pre-migration index inventory and backup evidence.
- Preserve collection/document counts.

## Rollback Allowlist

For every created index, retain:

- collection;
- exact index name;
- exact key order;
- exact unique/sparse/TTL/partial/collation options;
- creation result and timestamp.

Rollback may drop a newly created index only when:

1. it is listed in the approved change record;
2. its current definition exactly matches the created definition;
3. dependent application behavior has been stopped or evaluated;
4. the rollback owner approves;
5. post-drop verification is ready.

The conditional legacy Payment TTL rollback may recreate the old index only
when an incident decision explicitly requires it and the exact captured
pre-migration definition is used. Because that TTL can delete financial
records, recreation is normally unsafe and requires a separate risk approval.

## Verification Procedure

1. verify staging identity again;
2. record pre-rollback counts/indexes;
3. dry-run the exact index-specific reversal;
4. apply one approved operation;
5. read back the exact definition;
6. compare collection/document counts;
7. run application health and affected synthetic flow;
8. restore the intended final staging index state if the rollback was only a
   controlled proof;
9. record sanitized evidence;
10. revoke the migration user.

## Current Result

- Proof target: `payments.order_1_createdAt_-1`
- Definition: `{ order: 1, createdAt: -1 }`, non-unique
- Pre-proof collections/documents/indexes: 19 / 1 / 33
- After exact drop: 19 / 1 / 32; target absent
- After exact recreate: 19 / 1 / 33; target exact
- Full before/after index signature: matched
- Document-count comparison: unchanged
- Staging marker: intact
- Local application health after rollback: HTTP 200
- Raw webhook safety after rollback: HTTP 200, Buffer preserved
- Broad index operation: none
- Document mutation: none
- Database drop: none
- Production action: none

The proof used the dedicated migration identity, required the target collection
to be empty, dropped only the exact named allowlisted index, recreated it with
the exact key order/name/options, and verified the full final index signature.

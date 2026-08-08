# P3 Staging Pre-Migration Data Checks

## Status

**PASS — 19/19 aggregate compatibility checks returned zero**

All checks ran read-only against the independently verified staging source and
returned aggregate counts only.

## Required Read-Only Checks

| Check | Required output | Current result |
|---|---|---|
| Duplicate `Order.orderId` | duplicate-group count | 0 |
| Duplicate Order user/idempotency | duplicate-group count | 0 |
| Duplicate Payment user/idempotency | duplicate-group count | 0 |
| Duplicate Payment provider/providerPaymentId | duplicate-group count | 0 |
| Duplicate webhook provider/providerEventId | duplicate-group count | 0 |
| Duplicate manual `customerReferenceHash` | duplicate-group count | 0 |
| Duplicate Refund number | duplicate-group count | 0 |
| Duplicate Refund payment/idempotency | duplicate-group count | 0 |
| Duplicate Refund provider/providerRefundId | duplicate-group count | 0 |
| Duplicate User email | duplicate-group count | 0 |
| Duplicate Inventory operation key | duplicate-group count | 0 |
| Missing/malformed Payment provider | aggregate count | 0 |
| Unexpected Payment statuses | aggregate count | 0 |
| Payment records affected by legacy TTL | aggregate count | 0 |
| Payment provider-reference type/null incompatibility | aggregate count | 0 |
| Manual-reference type/null incompatibility | aggregate count | 0 |
| Refund idempotency partial-filter incompatibility | aggregate count | 0 |
| Refund provider-reference type/null incompatibility | aggregate count | 0 |
| Inventory operation-key type/null incompatibility | aggregate count | 0 |

The active Payment field is `provider`; six canonical provider codes and all
11 canonical Payment statuses were used for validation.

## Safety Rules Applied

- output aggregate counts only;
- do not return customer, payment, provider, bank, address, email, phone, token,
  or raw reference values;
- sanitize unavoidable identifiers;
- do not delete or rewrite incompatible records;
- block only the affected index and produce a remediation proposal;
- take no index action until every unique-index prerequisite passes.

## Current Aggregate Results

All 19 counts are zero. This is expected because the application collections
are currently absent; the reads did not create them. The result proves no
existing data conflict, but it does not authorize creating indexes on absent
collections when the migration contract requires collection counts to remain
unchanged.

- individual values/documents returned: 0;
- document writes/deletes: 0;
- collection/index mutations: 0;
- production access: none.

## Post-Initialization Rerun

The same 19 aggregate checks were rerun after the seven empty collections were
created and before index apply.

- checks passed: 19/19;
- non-zero compatibility counts: 0;
- absent target collections: 0;
- document bodies returned: 0;
- data mutations: 0;
- conflicts blocking index apply: 0;
- production access: none.

This rerun, together with the fresh backup, authorized the exact allowlisted
index apply.

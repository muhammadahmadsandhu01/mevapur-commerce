# P3 Production Atlas Index Runbook

## Status

**RUNBOOK ONLY — PRODUCTION EXECUTION PROHIBITED IN P3**

## 1. Change Approval

- obtain a production change ticket;
- attach the reviewed staging migration evidence;
- require database owner, application owner, security, and rollback-owner
  approval;
- prohibit provider activation or unrelated deployment in the same window.

## 2. Maintenance Window

- select a low-traffic window;
- define start/end, freeze, rollback, and abort deadlines;
- communicate expected index-lock/resource effects;
- keep the previous application version available.

## 3. Operator Roles

- change commander;
- Atlas migration operator;
- application health operator;
- security/audit observer;
- rollback owner;
- incident approver.

No individual should approve and execute every stage alone.

## 4. Production Identity Verification

Privately verify at least:

- exact approved Atlas project;
- exact approved cluster;
- exact production database;
- dedicated temporary production migration user;
- production environment marker;
- expected application deployment version;
- absence of staging URI/user/marker.

Record pass/fail properties only. Do not print URI, username, host, or secrets.

## 5. Fresh Production Dump

- create a new timestamped production dump;
- require `mongodump` exit code 0;
- use conservative collection concurrency;
- retain BSON/metadata files outside the repository;
- never overwrite an older verified dump;
- do not use `--drop`.

## 6. Isolated Restore Verification

- restore into a uniquely named isolated verification database;
- compare collection names, per-collection counts, total documents, and index
  definitions;
- never restore into production;
- remove only the exact isolated database after successful comparison and
  approval.

## 7. Immediate Inventory

Immediately before the window record:

- collection names;
- per-collection and aggregate document counts;
- exact index definitions;
- application version;
- relevant Payment/Order/Webhook/Refund status aggregates;
- replica/cluster health in sanitized form.

## 8. Duplicate and Compatibility Checks

Run all checks from
`docs/P3_STAGING_PRE_MIGRATION_DATA_CHECKS.md`. Every required unique-index
check must return zero duplicate groups. Count records affected by any legacy
TTL. Do not print documents.

If any check fails, stop and create a separately approved remediation plan. Do
not delete or rewrite data during this change.

## 9. Dry-Run

The production dry-run must:

- use the reviewed migration version and allowlist;
- verify exact production identity;
- verify fresh backup evidence;
- compare actual indexes/options;
- execute zero mutations;
- return exit code 0 only when all preconditions pass.

## 10. Exact Allowlisted Migration

- select only operations that passed staging;
- use explicit `createIndex` names/options;
- verify each result before continuing;
- remove only the exact reviewed legacy Payment TTL when its current
  name/keys/options match;
- stop on any mismatch;
- do not run broad synchronization.

## 11. Monitoring

Monitor:

- Atlas CPU/memory/disk/IO;
- replication lag and connection saturation;
- query latency and error rate;
- backend health/readiness;
- authentication/order/payment/webhook/refund errors;
- index build state.

Pause/abort at the approved thresholds.

## 12. Post-Migration Verification

- re-read all affected index definitions;
- compare collection/document counts;
- confirm no unexpected collection/index change;
- rerun duplicate checks;
- verify legacy Payment TTL removal when approved;
- verify required P0/P1/P2/P2.2 indexes;
- rerun migration in dry-run/idempotency mode.

## 13. Application Health

Run only controlled production-safe reads and approved health checks:

- backend liveness/readiness;
- storefront/admin availability;
- authentication read/controlled login;
- product read;
- provider availability;
- raw webhook route/configuration check without a live charge.

Do not run Jest against production.

## 14. Rollback Decision Points

Rollback or stop when:

- identity changes or cannot be re-proven;
- backup/restore evidence is incomplete;
- duplicate check fails;
- index definition differs from expectation;
- index build causes unacceptable operational impact;
- counts change unexpectedly;
- health/error thresholds breach;
- an unapproved index is affected.

Prefer index-specific forward correction or exact rollback. Database restore is
last-resort incident recovery only.

## 15. Incident Stop Conditions

Immediately stop on:

- suspected credential/URI exposure;
- production customer-data anomaly;
- document deletion;
- unexpected TTL behavior;
- cross-environment connection;
- authentication/order/payment consistency failure;
- unapproved provider network activity;
- Atlas authorization scope wider than approved.

Escalate through the incident owner; do not improvise cleanup.

## 16. Secret Handling

- inject secrets through the approved private store;
- never paste them into tickets, terminal transcripts, source, reports, or
  chat;
- sanitize logs before retention;
- rotate/revoke the temporary migration user;
- rotate any credential suspected of exposure.

## 17. Evidence to Retain

- approvals/change ticket;
- source release/commit identity;
- fresh dump path and checksums;
- isolated restore comparison;
- sanitized identity decision;
- pre/post counts and index inventories;
- duplicate-check aggregate results;
- dry-run/apply/idempotency exit codes;
- application health results;
- incident/rollback decisions;
- migration-user revocation evidence.

## Explicit Prohibitions

This runbook prohibits:

- broad `syncIndexes`;
- broad `dropIndexes`;
- destructive production restore or `mongorestore --drop`;
- production `dropDatabase`;
- production Jest;
- unreviewed document cleanup;
- provider activation in the same window;
- multi-currency, Redis, Docker, CI/CD, or unrelated application changes.

## P3 Decision

This production runbook was prepared but not executed. Production Atlas was not
connected to or modified during P3.

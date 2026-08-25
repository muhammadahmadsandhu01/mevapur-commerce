# P3 Production Atlas Index Runbook

## Status

**CONTROLLED RUNNER AVAILABLE — NO PRODUCTION EXECUTION HAS OCCURRED**

## Phase 1J production identity warning

`mevapur_staging` is the authoritative production database for the fresh
launch. Its name is historical and must never be used to infer staging safety.
The production runner requires the exact database name and also requires both
`NODE_ENV=production` and `APP_ENV=production`.

The runner is
`backend/scripts/migrations/p3-production-index-reconciliation.js`. Importing
it is inert. Running it without `--apply` is a dry-run. It never loads a local
`.env` file and must receive `MONGODB_URI` from the approved private process
environment.

## Runner prerequisites

- approved maintenance/change window and named operator;
- exact reviewed source commit;
- TLS-enabled, explicit `mevapur_staging` URI in the private environment;
- replica-set primary, matching set identity, logical sessions, and
  transaction-capable wire version;
- an archive-format gzip dump outside the repository;
- independently recorded archive byte size and SHA-256;
- zero duplicate and malformed-value preflight counts;
- no restore, cleanup, provider activation, or unrelated deployment in the
  same step.

The accepted 2,467-byte schema-only baseline may be used for a dry-run. Its
restore rehearsal is **not verified**. Apply requires a freshly verified dump
whose filesystem modification time is no more than 24 hours old.

Current accepted dry-run evidence:

- path: `C:\MevaPur-Backups\mevapur-live-20260825-143323.archive.gz`;
- size: `2467` bytes;
- SHA-256:
  `C45B26DD1860B8CA5A9D1E81633DFB450B06D4B9B64FC3BFA441E5BE65DEDFA7`.

This evidence establishes a valid dump of the accepted schema-only baseline;
it does not establish a successful restore rehearsal.

## Dry-run command

Set `NODE_ENV=production` and `APP_ENV=production` in the process. Inject
`MONGODB_URI` through the approved private mechanism; never place it on the
command line or in this repository.

```powershell
node backend/scripts/migrations/p3-production-index-reconciliation.js `
  --backup <ABSOLUTE_ARCHIVE_PATH_OUTSIDE_REPOSITORY> `
  --backup-size <EXPECTED_BYTES> `
  --backup-sha256 <EXPECTED_SHA256>
```

The accepted schema-only snapshot is expected to report:

- 13 exact indexes retained;
- 6 indexes proposed for creation:
  - `refunds.unique_refund_return`;
  - `returns.returnNumber_1`;
  - `returns.status_1_createdAt_-1`;
  - `returns.customer_1_createdAt_-1`;
  - `returns.order_1`;
  - `returns.unique_return_refund`;
- 1 reviewed reconciliation:
  `refunds.unique_provider_refund_reference` from the exact legacy
  `unique+sparse` definition to the reviewed `unique+partial` definition.

Any different count or definition is a stop condition.

## Apply command template

Apply is a separately approved action. The literal confirmation phrase is
deliberately specific to the misleading production database name.

```powershell
node backend/scripts/migrations/p3-production-index-reconciliation.js `
  --backup <FRESH_ABSOLUTE_ARCHIVE_PATH_OUTSIDE_REPOSITORY> `
  --backup-size <EXPECTED_BYTES> `
  --backup-sha256 <EXPECTED_SHA256> `
  --apply `
  --confirm-production I_ACKNOWLEDGE_MEVAPUR_STAGING_IS_PRODUCTION `
  --backup-acknowledged
```

The runner creates only missing controlled indexes. It reconciles the known
refund index only when its current name, key order, and options exactly match
the reviewed legacy definition. Unknown conflicts fail closed. All reads and
preflights finish before the first mutation. Operations are sequential and
stop on the first failure.

## Failure handling and rollback policy

The safe result includes `mutationStarted` and completed operation identities.
Never infer that a failed run made no changes; use those fields and re-read the
indexes. The runner performs no automatic rollback and never recreates a
guessed definition. If failure occurs after the reviewed legacy index was
dropped, stop traffic-sensitive work, retain the evidence, and obtain a new
forward-correction approval. Database restore is incident recovery only.

## Post-apply verification

1. Re-run the command in dry-run mode and require all 20 indexes to be retained.
2. Re-read affected index names, ordered keys, uniqueness, sparse, and partial
   options.
3. Re-run all duplicate/malformed-value counts and require zero.
4. Compare controlled collection counts with the pre-change inventory.
5. Confirm backend `/api/health` and `/api/ready`, then public catalog reads.
6. Record the safe summary, commit, archive metadata, approvals, and operator.

## Cleanup, credential, and deployment ordering

1. Complete and verify the index operation first.
2. Run legacy-secret cleanup only in a later, separately approved step: dry-run,
   fresh backup acknowledgement, explicit apply, then verification.
3. Revoke the temporary MongoDB migration credential after evidence capture.
4. Rotate the application MongoDB credential through the private Render store,
   redeploy the backend, and verify health/readiness before revoking the old
   credential.
5. Rotate JWT signing credentials only in a separate window after MongoDB is
   stable; plan for existing sessions/tokens to become invalid.
6. Deploy the verified backend on Render before storefront/admin builds.
7. Set the documented Vercel public variables for both Production and Preview,
   build the Storefront, then build the Admin project.
8. Perform read-only smoke checks before enabling traffic or search indexing.

A maintenance window is recommended even for the fresh schema-only launch so
the drop/create reconciliation cannot race application writes.

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
- exact database name `mevapur_staging`, classified as production data despite
  its name;
- dedicated temporary production migration user;
- process identity `NODE_ENV=production` and `APP_ENV=production`;
- expected application deployment version;
- absence of any attempt to reinterpret a synthetic staging marker as
  production authorization.

Record pass/fail properties only. Do not print URI, username, host, or secrets.

## 5. Fresh Production Dump

- create a new timestamped production dump;
- require `mongodump` exit code 0;
- use conservative collection concurrency;
- retain the archive-format gzip dump and its size/hash evidence outside the
  repository;
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
- verify backup path, size, and hash evidence; freshness is an apply-only gate;
- compare actual indexes/options;
- execute zero mutations;
- return exit code 0 only when all preconditions pass.

## 10. Exact Allowlisted Migration

- select only operations that passed staging;
- use explicit `createIndex` names/options;
- verify each result before continuing;
- report any legacy Payment TTL as requiring a separate review; this
  Return/Refund production runner does not remove it;
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

# P3 Staging Schema Initialization

## Status

**PASS — exact seven-collection initialization, idempotency, backup, and
isolated restore verified**

This was the separately approved synthetic staging schema-initialization
milestone. It used only the dedicated staging migration URI from the private
configuration outside the repository. No private value was printed, logged, or
persisted.

## Implementation

Script:

```text
backend/scripts/migrations/p3-staging-schema-initialization.js
```

The script supports `--mode dry-run`, `--mode apply`, and explicit `--config`.
It validates the exact database and staging marker, rejects an ambiguous or
production-like identity, and permits only these collection names:

- `users`
- `sessions`
- `orders`
- `inventorytransactions`
- `payments`
- `paymentwebhookevents`
- `refunds`

Static verification passed:

| Check | Result |
|---|---:|
| JavaScript syntax | PASS |
| Explicit `createCollection` implementation | 1 |
| `createIndex` calls | 0 |
| `syncIndexes` calls | 0 |
| `dropIndex` / `dropDatabase` calls | 0 / 0 |
| Document insert calls | 0 |
| Generic backend environment URI reads | 0 |
| Private username literals | 0 |

## Pre-Initialization Gate

| Property | Required | Verified |
|---|---:|---:|
| Collections | 1 | 1 |
| Collection identity | marker only | PASS |
| Aggregate documents | 1 | 1 |
| Non-marker documents | 0 | 0 |
| Aggregate indexes | 1 | 1 |
| Approved target collections absent | 7 | 7 |
| Marker policy | staging, synthetic only, production false | PASS |

The migration identity was independently authenticated. No other database was
queried for comparison.

## Dry-Run

The first dry-run exited `0` and proposed exactly seven collection creates.

| Operation class | Count |
|---|---:|
| Approved collection creates | 7 |
| Unapproved collection creates | 0 |
| Document operations | 0 |
| Index operations | 0 |
| Database mutations | 0 |
| Provider operations | 0 |

## Apply and Idempotency

The first apply exited `0` and used explicit `createCollection` operations.

| Property | Before | After |
|---|---:|---:|
| Collections | 1 | 8 |
| Aggregate documents | 1 | 1 |
| Aggregate indexes | 1 | 8 |
| Empty approved application collections | 0 | 7 |
| Allowlisted application indexes | 0 | 0 |

The staging marker remained unchanged. No application document was inserted.

The second dry-run and second apply both exited `0`. All seven collections were
reported already present, proposed creates were `0`, actual creates were `0`,
and collection/document/index counts remained `8 / 1 / 8`.

## Fresh Post-Initialization Backup

Verified dump:

```text
C:\MevaPur-Backups\mongodb-staging-post-schema-init-20260728-093143
```

| Evidence | Result |
|---|---|
| `mongodump` exit code | `0` |
| BSON files | 8 |
| Metadata files | 8 |
| Hashed files / manifest entries | 17 / 17 |
| Aggregate dump documents | 1 |
| Aggregate dump indexes | 8 |
| Manifest verification | PASS |

Manifest SHA-256:

```text
6356237C47ADFBD3DA25A4E68222E887BD1C015AA077F6D2BA81B146685E361F
```

Earlier recovery dumps were retained and not modified.

## Isolated Restore Verification

The fresh dump was restored only into
`mevapur_staging_restore_test_p3`. Source and target names were verified
different before restore.

| Check | Result |
|---|---|
| `mongorestore` exit code | `0` |
| Collections compared | 8/8 |
| Aggregate documents compared | 1/1 |
| Aggregate indexes compared | 8/8 |
| Empty application collections | 7/7 |
| Staging marker | Exact match |
| Allowlisted application indexes before migration | 0 |
| Exact restore-test database dropped | Yes |
| Restore-test database absent afterward | Yes |
| Source reconnected and unchanged | PASS |
| Source staging database dropped | No |
| Other database deleted | No |

## Boundary Confirmation

- The initialization step created no unlisted collection.
- The later approved application smoke caused Mongoose to materialize 11
  additional empty model collections. That later runtime side effect is
  recorded separately and is not attributed to schema initialization.
- Production Atlas was not accessed.
- No automated test used Atlas.
- No external payment provider was invoked.
- No existing project file was deleted, moved, or renamed.


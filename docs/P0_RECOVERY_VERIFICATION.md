# P0 Recovery Verification

## Outcome

P0 source recovery remains verified. After the Atlas IP access-list correction, the controlled MongoDB dump, isolated restore, collection-count comparison, index comparison, and active-database integrity checks all passed.

Manual deletion of the uniquely named isolated restore-test database has now been independently verified through a private, read-only Atlas connection. The isolated database is absent, the active database remains present with the previously verified 14 collections, zero documents, and 57 indexes, and the verified dump remains intact.

The P0 recovery gate is **PASSED**. No source-code, configuration, test, dependency, Order, or Payment implementation was changed before this gate passed.

## Source and Environment Backup

| Item | Result |
|---|---|
| Timestamp | `20260727-100550` |
| Source backup | `C:\MevaPur-Backups\mevaPur-pre-p0-20260727-100550` |
| Private environment backup | `C:\MevaPur-Backups\mevaPur-env-pre-p0-20260727-100550` |
| Copy result | PASS — Robocopy exit code `1` (files copied successfully) |
| Required paths verified | PASS — 12 |
| First-party SHA-256 comparisons | PASS — 334 matched, 0 mismatches |
| Environment files checksum-verified | PASS — 3 |
| Checksum manifest | `C:\MevaPur-Backups\mevaPur-pre-p0-20260727-100550\SOURCE_SHA256_MANIFEST.csv` |

The verified required paths include:

- `backend/app.js`
- `backend/server.js`
- `backend/package.json`
- `backend/config/email.config.js`
- `frontend/package.json`
- `admin-panel/package.json`
- `backend/models`
- `backend/services`
- `backend/controllers`
- `backend/routes`
- `backend/repositories`
- `backend/tests`

The copy excluded regeneratable dependency, build, log, coverage, and cache directories. It retained untracked first-party source, package and lock files, tests, documentation, Laravel first-party files, and the existing Git metadata.

A first backup attempt encountered a PowerShell/.NET compatibility error during environment-file relative-path calculation. Its unverified source directory `C:\MevaPur-Backups\mevaPur-pre-p0-20260727-100445` and partial environment directory `C:\MevaPur-Backups\mevaPur-env-pre-p0-20260727-100445` were not deleted or treated as verified. The new `100550` backup set above used a compatible calculation and passed all stated verification checks.

## Git Preservation Record

- Branch: `main`
- Upstream state at capture: `main...origin/main [ahead 1]`
- Exact pre-P0 status: `docs/PRE_P0_GIT_STATUS.txt`
- Exact pre-P0 unstaged patch: `docs/PRE_P0_WORKING_TREE.patch`
- Potential secret assignments found in captured diff: 0
- Secret-bearing `.env` or `.env.local` files tracked by Git: none

The working tree was already dirty before P0. Its pre-existing state included three tracked deletions, 33 tracked modifications, and two untracked backend source files. These conditions were captured without restoring, deleting, moving, renaming, or rewriting them.

## MongoDB Recovery Gate

| Check | Result |
|---|---|
| `mongodump` available | PASS — version `100.17.0` |
| `mongorestore` available | PASS — version `100.17.0` |
| Sanitized executable directory | `C:\Program Files\MongoDB\Tools\100\bin` |
| Deployment | Atlas/SRV |
| Source database identification | Resolved privately; exact name not recorded |
| Verified Mongo dump | `C:\MevaPur-Backups\mongodb-pre-p0-20260727-115109` |
| Controlled dump result | PASS — exit code `0`; 14 BSON and 14 metadata files |
| Isolated restore database | `mevapur_restore_test_20260727_115109` |
| Controlled restore result | PASS — exit code `0` |
| Collection-count comparison | PASS — 14/14 collections; all source and restored counts match |
| Index comparison | PASS — 57/57 indexes match |
| Representative document query | Not applicable — all 14 source collections currently contain zero documents; collection reads succeeded |
| Active database unchanged | PASS — 14 collections and zero documents before/after |
| Restore-test cleanup | PASS — manual Atlas deletion independently verified |
| Unverified completed-file artifact | `C:\MevaPur-Backups\mongodb-pre-p0-20260727-111935` — 14 BSON and 14 metadata files, but parent timeout prevented exit-code capture |
| Controlled dump attempt | `C:\MevaPur-Backups\mongodb-pre-p0-20260727-112554` — exit `1`, Atlas shard connection closed while counting a collection |
| Conservative single-collection retry | `C:\MevaPur-Backups\mongodb-pre-p0-20260727-112810` — exit `1`, Atlas authentication handshake timed out waiting for a server response |
| Sanitized recovery metadata | `C:\MevaPur-Backups\mongodb-pre-p0-20260727-115109\P0_RECOVERY_METADATA.json` |
| Live database mutation by P0 | None — source operations were read-only; writes targeted only the isolated database |

Earlier wrapper-only attempts were retained but are not classified as verified: `mongodb-pre-p0-20260727-112353` used an invalid URI-path database-name inference, and `mongodb-pre-p0-20260727-112447` was interrupted by Windows PowerShell treating native progress on stderr as terminating output. Neither is recovery evidence.

The first corrected directory restore returned exit code `0` but selected no namespaces. It created no collections. A retry using explicit `--nsInclude`, `--nsFrom`, and `--nsTo` from the dump root restored all expected collections and indexes. The comparison then passed.

Cleanup was initially attempted only after comparison passed. Atlas rejected `dropDatabase`; no attempt was made to bypass that denial by deleting collections individually. The user subsequently reported deleting `mevapur_restore_test_20260727_115109` successfully through Atlas.

Two earlier private read-only verification probes failed during server selection. After independent DNS/TCP checks, the immediate retry succeeded. It verified:

- `mevapur_restore_test_20260727_115109` is absent;
- the active database is present;
- the active snapshot remains 14 collections, zero documents, and 57 indexes;
- five databases are visible to the recovery account;
- the verified dump still contains 14 BSON and 14 metadata files with recorded dump exit code `0`.

No P0 automation deleted any other database. Within the available project recovery evidence, the only expected database removal is the isolated restore-test database and the active project database is unchanged.

## Final Post-P0 Read-Only Verification

The final read-only Atlas verification completed on 2026-07-27 with exit code `0`. It used the existing private configuration and emitted only sanitized status and aggregate counts:

- Atlas connection: PASS
- isolated restore-test database absent: PASS
- active database present: PASS
- visible database count unchanged: 5
- active collection count unchanged: 14
- active document count unchanged: 0
- active index count unchanged: 57
- verified dump retained: PASS
- compressed dump contents: 14 BSON files and 14 metadata files

No URI, host, database credential, secret, or document content was printed or written to the project.

## Gate Closure

The prior sanitized `MongoServerSelectionError` blocker is resolved. Independent cleanup verification succeeded without exposing the URI, hosts, username, password, or document contents.

The recovery gate passed on the combined evidence of the verified source backup, SHA-256 manifest, successful dump and isolated restore, exact collection/index comparison, unchanged active snapshot, and verified isolated cleanup.

## Safe Commands Required Before Resuming

Confirm that the Codex machine's current public egress IP still matches the Atlas Project IP Access List and that DNS/TLS access to the Atlas deployment is available. Then rerun only the read-only verification:

- the isolated database must be absent;
- the active database must be present;
- the active snapshot must remain 14 collections, zero documents, and 57 indexes;
- the verified dump must remain at `C:\MevaPur-Backups\mongodb-pre-p0-20260727-115109`.

Installed tool verification:

```powershell
Get-Command mongodump
Get-Command mongorestore
mongodump --version
mongorestore --version
```

Official installation reference:

- https://www.mongodb.com/docs/database-tools/installation/?operating-system=windows&package-type=msi

For a future recovery drill, set the connection string and database name privately. Do not paste or commit their values:

```powershell
$env:MEVAPUR_MONGO_URI = '<set privately>'
$sourceDatabase = '<set privately>'
$recoveryTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpDirectory = "C:\MevaPur-Backups\mongodb-pre-p0-$recoveryTimestamp"
$restoreDatabase = "mevapur_p0_restore_$recoveryTimestamp"
New-Item -ItemType Directory -Path $dumpDirectory | Out-Null
```

Create the dump with conservative collection concurrency:

```powershell
mongodump --uri="$env:MEVAPUR_MONGO_URI" --db="$sourceDatabase" --out="$dumpDirectory" --gzip --numParallelCollections=1
if ($LASTEXITCODE -ne 0) { throw "mongodump failed" }
```

Restore only into the isolated database:

```powershell
$dumpDatabaseDirectory = Join-Path $dumpDirectory $sourceDatabase
mongorestore --uri="$env:MEVAPUR_MONGO_URI" --gzip --nsFrom="$sourceDatabase.*" --nsTo="$restoreDatabase.*" $dumpDatabaseDirectory
if ($LASTEXITCODE -ne 0) { throw "mongorestore failed" }
```

After restore, compare source and isolated collection names and counts with an approved MongoDB client. Only after the comparison passes, remove the exact isolated database:

```javascript
db.getSiblingDB("mevapur_p0_restore_<exact-timestamp>").dropDatabase()
```

Do not use `--drop` against the source database. Do not continue P0 until the dump, restore, comparison, and isolated cleanup are all confirmed.

Official command references:

- https://www.mongodb.com/docs/database-tools/mongodump/
- https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-examples/

## Recovery Gate Decision

| Gate | Status |
|---|---|
| Dirty-tree capture | PASS |
| Tracked-secret check | PASS |
| External source backup | PASS |
| Private environment backup | PASS |
| Required-path verification | PASS |
| SHA-256 verification | PASS |
| MongoDB Database Tools | PASS |
| Controlled MongoDB dump | PASS — exit `0` |
| Isolated MongoDB restore | PASS — exit `0` |
| Collection-count comparison | PASS — 14/14 |
| Index comparison | PASS — 57/57 |
| Active database unchanged | PASS |
| Isolated restore cleanup | PASS — manual deletion verified |
| Independent cleanup verification | PASS |
| Active database final snapshot | PASS — 14 collections, 0 documents, 57 indexes |
| Verified dump retained | PASS |
| Permission to proceed with P0 source work | GRANTED |

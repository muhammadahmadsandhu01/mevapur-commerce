# P1 Order Recovery Checkpoint

## Outcome

The post-P0, pre-Order source recovery checkpoint passed on 2026-07-27. No P1 Order source edit occurred before this checkpoint completed.

## Git Capture

- Branch state: `main...origin/main [ahead 1]`
- Dirty working tree: preserved
- Status snapshot: `docs/P1_PRE_ORDER_GIT_STATUS.txt`
- Binary-capable working-tree patch: `docs/P1_PRE_ORDER_WORKING_TREE.patch`
- Patch SHA-256: `D0B739220ADF27AB796CC753C9E354FEF44F1567BDACEAB1108A35BFA4444063`
- Pre-existing tracked deletions: retained
- Files moved or renamed by this checkpoint: none

## Secret and Environment Safety

- Actual tracked `.env` variants: 0
- Potential secret-assignment locations in the current diff: 1
- The only location is the test-only `JWT_SECRET` assignment in `backend/tests/setup.js`.
- No value was printed or recorded.
- No live secret, URI, username, password, provider credential, cookie, or token was copied into this report.

## External Source Backup

- Backup path: `C:\MevaPur-Backups\mevaPur-post-p0-pre-order-20260727-134957`
- Robocopy exit code: `1` (copy completed; files copied)
- Excluded regeneratable paths: dependency directories, build output, coverage, logs, and temporary caches
- Retained: first-party backend, storefront, admin, tests, docs, package/lock files, untracked source, P0 changes, Laravel first-party source, environment files, and Git metadata
- Backup Git metadata present: PASS

## SHA-256 Verification

The stable project-file comparison excluded regeneratable output and `.git` control metadata:

| Check | Result |
|---|---:|
| Live stable files | 10,072 |
| Backup stable files | 10,072 |
| SHA-256 matches | 10,072 |
| Missing from backup | 0 |
| Extra in backup | 0 |
| Hash mismatches | 0 |

An initial broader comparison included live Codex checkpoint metadata under `.git/refs/codex/turn-diffs/checkpoints`. It found 10,280 matches and one automatically changing control-metadata file. That path is not first-party source and changes while tool turns execute. The stable source comparison above therefore excludes `.git` from the hash set while separately confirming that the backup retained the `.git` directory.

## MongoDB Recovery Evidence

The existing recovery evidence is complete and non-contradictory:

- verified dump retained at `C:\MevaPur-Backups\mongodb-pre-p0-20260727-115109`;
- isolated restore and collection/index comparisons passed;
- isolated restore-test database is absent;
- active Atlas database remained unchanged;
- P0 tests use a loopback-only MongoDB Memory Server.

The destructive restore drill was not repeated. The verified dump was not modified.

## Gate Decision

| Gate | Status |
|---|---|
| Git status and diff captured | PASS |
| Secret assignment scan | PASS |
| Actual environment files untracked | PASS |
| External source backup | PASS |
| Stable file count comparison | PASS |
| SHA-256 comparison | PASS |
| Existing database recovery evidence | PASS |
| Permission to capture P1 baseline | GRANTED |


# Operational Runbook: Database Backup, Verification & Safe Restore

## 1. Backup Strategy & Architecture

- **Tooling**: Official MongoDB tools (`mongodump`/`mongorestore`) via `mongo:7.0.14-jammy` or operational script `scripts/ops/backup-database.js`.
- **Integrity**: Every backup creates:
  1. Compressed archive: `database.archive.gz`
  2. Cryptographic checksum: `checksum.sha256` (SHA-256)
  3. Metadata manifest: `manifest.json` recording collection counts, indexes, and document tallies.
- **Frequency**:
  - Full automated daily backup at 02:00 UTC.
  - Pre-deployment snapshot before every release or schema migration.
- **Retention**: Retain daily backups for 30 days, monthly backups for 1 year.

---

## 2. Taking a Manual or Scheduled Backup

```bash
# Execute operational backup
node scripts/ops/backup-database.js \
  --outputDir=/opt/mevapur/backups \
  --mongoUri="mongodb://mevapur_app:pass@127.0.0.1:27017/mevapur-commerce" \
  --releaseTag="release-v1.0.0"
```

Output structure:
```text
backups/
└── backup-2026-09-21T12-00-00-000Z/
    ├── database.archive.gz
    ├── checksum.sha256
    └── manifest.json
```

---

## 3. Safe Database Restore Procedure

### Safety Barriers Enforced by `restore-database.js`:
1. **Target Confirmation Token**: Requires explicit `--apply-token=PHASE9_RESTORE_CONFIRMED`.
2. **Protected Database Guard**: Will strictly reject restoring into `production`, `staging`, `mevapur-commerce`, `admin`, `config`, or `local`.
3. **Integrity Validation**: Computes and compares SHA-256 hash before decompressing or restoring.

### Executing Safe Restore into Disposable Target Database:
```bash
node scripts/ops/restore-database.js \
  --backupDir=/opt/mevapur/backups/backup-2026-09-21T12-00-00-000Z \
  --confirm-target-db=disposable_restore_verification_db \
  --apply-token=PHASE9_RESTORE_CONFIRMED \
  --mongoHost=127.0.0.1:27017
```

---

## 4. Disaster Recovery (DR) Break-Glass Procedure

In the extreme event of catastrophic primary data corruption requiring authoritative database replacement:
1. Obtain written executive/owner authorization.
2. Put application in maintenance mode: `docker compose stop backend frontend admin-panel worker-outbox`.
3. Take a final forensic cold snapshot of the corrupted volume.
4. Execute authenticated `mongorestore` using admin credentials into a newly initialized database instance:
   ```bash
   mongorestore --archive=/opt/mevapur/backups/backup-.../database.archive.gz --gzip --drop --nsInclude="mevapur-commerce.*"
   ```
5. Run data integrity reconciliation: `npm run reconcile:tax` and `npm run test:phase9`.
6. Bring services back online: `docker compose up -d`.

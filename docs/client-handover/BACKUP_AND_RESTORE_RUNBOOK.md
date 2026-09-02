# Disaster Recovery, Database Backup & Restore Runbook

**Version**: 1.0.0  
**Target**: Database Administrators & Infrastructure Reliability Engineers

---

## 1. Backup Strategy Overview

| Tier | Backup Type | Frequency | Retention | Storage Location |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (Continuous)** | MongoDB Oplog / PITR | Continuous | 7 Days | Cloud Object Storage (Encrypted S3/GCS) |
| **Tier 2 (Daily Snapshot)** | Compressed `mongodump` | Every 24h at 02:00 UTC | 30 Days | Geo-redundant cold storage |
| **Tier 3 (Monthly Archive)** | Full database export | 1st of each month | 365 Days | Compliant archive bucket |

---

## 2. Automated Daily Backup Command

To generate an encrypted, gzip-compressed snapshot of the production database:

```bash
# Set environment variables
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/mevapur/${TIMESTAMP}"
MONGODB_URI="${MONGODB_URI}"

# Execute mongodump with gzip compression and oplog capture
mongodump \
  --uri="${MONGODB_URI}" \
  --gzip \
  --oplog \
  --out="${BACKUP_DIR}"

# Encrypt the archive using AES-256
tar -czf - -C "${BACKUP_DIR}" . | openssl enc -aes-256-cbc -salt -pbkdf2 -out "${BACKUP_DIR}.tar.gz.enc" -pass env:BACKUP_ENCRYPTION_PASSPHRASE

# Upload to remote cloud bucket
aws s3 cp "${BACKUP_DIR}.tar.gz.enc" "s3://mevapur-backups/daily/${TIMESTAMP}.tar.gz.enc"
```

---

## 3. Restoration Procedure (Disaster Recovery Simulation)

### Step 1: Download and Decrypt Archive
```bash
aws s3 cp "s3://mevapur-backups/daily/TARGET_BACKUP.tar.gz.enc" ./backup.tar.gz.enc

openssl enc -d -aes-256-cbc -pbkdf2 -in ./backup.tar.gz.enc -out ./backup.tar.gz -pass env:BACKUP_ENCRYPTION_PASSPHRASE

mkdir -p ./restore-data
tar -xzf ./backup.tar.gz -C ./restore-data
```

### Step 2: Restore to Isolated Test Database
```bash
mongorestore \
  --uri="mongodb://127.0.0.1:27017/mevapur_restore_test" \
  --gzip \
  --drop \
  ./restore-data/mevapur
```

### Step 3: Run Ledger & Integrity Verification Script
```bash
node backend/scripts/verify-ledger-integrity.js
```
The integrity script asserts:
1. All orders have matching financial payment records
2. Inventory stock counts match historical adjustments
3. Coupon redemption counts equal committed coupon ledger records
4. SuperAdmin account exists and active

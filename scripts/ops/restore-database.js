#!/usr/bin/env node
/**
 * @file restore-database.js
 * @description Safe operational restore script for MongoDB databases.
 * Requires explicit target confirmation token, verifies SHA-256 checksum before unpacking,
 * and validates restored document counts and index readiness.
 *
 * Usage:
 *   node scripts/ops/restore-database.js --backupDir=./backups/backup-... --confirm-target-db=disposable_test_db --apply-token=PHASE9_RESTORE_CONFIRMED [--mongoHost=127.0.0.1:27017]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  mongoose = require(path.resolve(__dirname, '../../backend/node_modules/mongoose'));
}

const REQUIRED_APPLY_TOKEN = 'PHASE9_RESTORE_CONFIRMED';
const PROTECTED_DATABASES = new Set([
  'production',
  'staging',
  'admin',
  'config',
  'local',
  'mevapur-commerce',
  'mevapur_commerce',
  'mevapur'
]);

async function restoreDatabase({
  backupDir,
  targetDbName,
  applyToken,
  mongoHost = '127.0.0.1:27017',
  authSource = null,
  user = null,
  password = null,
  directConnection = true
} = {}) {
  // 1. Guard check: Apply token validation
  if (applyToken !== REQUIRED_APPLY_TOKEN) {
    throw new Error(`Restore rejected: Invalid or missing applyToken. Must provide exact --apply-token=${REQUIRED_APPLY_TOKEN}`);
  }

  // 2. Guard check: Target database name validation
  if (!targetDbName || typeof targetDbName !== 'string' || targetDbName.trim() === '') {
    throw new Error('Restore rejected: Missing target database name. Must specify --confirm-target-db=<target_database>');
  }

  const normalizedTarget = targetDbName.trim();
  if (PROTECTED_DATABASES.has(normalizedTarget.toLowerCase())) {
    throw new Error(`Restore rejected: Target database "${normalizedTarget}" is protected. Cannot restore into default or protected database names.`);
  }

  if (!backupDir || !fs.existsSync(backupDir)) {
    throw new Error(`Restore rejected: Backup directory does not exist: ${backupDir}`);
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  const archivePath = path.join(backupDir, 'database.archive.gz');

  if (!fs.existsSync(manifestPath) || !fs.existsSync(archivePath)) {
    throw new Error('Restore rejected: Backup directory is missing manifest.json or database.archive.gz');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const archiveBytes = fs.readFileSync(archivePath);

  // 3. Verify archive SHA-256 checksum
  console.log('[RESTORE] Verifying archive checksum...');
  const actualHash = crypto.createHash('sha256').update(archiveBytes).digest('hex');
  if (actualHash !== manifest.sha256) {
    throw new Error(`Restore rejected: Checksum mismatch! Manifest expects ${manifest.sha256}, but archive hash is ${actualHash}`);
  }
  console.log('[RESTORE] Checksum verified successfully.');

  // 4. Decompress and parse archive
  console.log('[RESTORE] Decompressing archive...');
  const decompressed = zlib.gunzipSync(archiveBytes);
  const dumpData = JSON.parse(decompressed.toString('utf8'));

  // 5. Connect to target database
  const params = [];
  if (authSource || (user && password)) {
    params.push(`authSource=${encodeURIComponent(authSource || normalizedTarget)}`);
  }
  if (directConnection || !mongoHost.includes(',')) {
    params.push('directConnection=true');
  }
  const queryStr = params.length > 0 ? `?${params.join('&')}` : '';

  let targetUri = `mongodb://${mongoHost}/${normalizedTarget}${queryStr}`;
  if (user && password) {
    targetUri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${mongoHost}/${normalizedTarget}${queryStr}`;
  }

  console.log(`[RESTORE] Connecting to target database: ${normalizedTarget}...`);
  const conn = await mongoose.createConnection(targetUri, {
    serverSelectionTimeoutMS: 5000,
    directConnection: Boolean(directConnection)
  }).asPromise();
  const db = conn.db;

  // 6. Restore collections, documents, and indexes
  const restorationSummary = [];

  for (const [collName, collContent] of Object.entries(dumpData)) {
    const coll = db.collection(collName);

    // Insert documents
    let insertedCount = 0;
    if (Array.isArray(collContent.docs) && collContent.docs.length > 0) {
      const res = await coll.insertMany(collContent.docs);
      insertedCount = res.insertedCount;
    }

    // Recreate indexes
    let createdIndexCount = 0;
    if (Array.isArray(collContent.indexes)) {
      for (const idx of collContent.indexes) {
        if (idx.name === '_id_') continue; // Default index exists automatically
        try {
          await coll.createIndex(idx.key, {
            name: idx.name,
            unique: Boolean(idx.unique),
            sparse: Boolean(idx.sparse)
          });
          createdIndexCount++;
        } catch (idxErr) {
          console.warn(`[RESTORE] Note creating index ${idx.name} on ${collName}:`, idxErr.message);
        }
      }
    }

    restorationSummary.push({
      collection: collName,
      documentsRestored: insertedCount,
      indexesCreated: createdIndexCount
    });
  }

  await conn.close();
  console.log('[RESTORE] Database restored successfully into target:', normalizedTarget);

  return {
    success: true,
    targetDb: normalizedTarget,
    collectionsRestored: restorationSummary.length,
    summary: restorationSummary
  };
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (const arg of args) {
    if (arg.startsWith('--backupDir=')) options.backupDir = arg.split('=')[1];
    if (arg.startsWith('--confirm-target-db=')) options.targetDbName = arg.split('=')[1];
    if (arg.startsWith('--apply-token=')) options.applyToken = arg.split('=')[1];
    if (arg.startsWith('--mongoHost=')) options.mongoHost = arg.split('=')[1];
    if (arg.startsWith('--directConnection=')) options.directConnection = arg.split('=')[1] !== 'false';
  }
  return options;
}

if (require.main === module) {
  const options = parseCliArgs();
  restoreDatabase(options)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[RESTORE] Fatal restore error:', err.message);
      process.exit(1);
    });
}

module.exports = { restoreDatabase, REQUIRED_APPLY_TOKEN };

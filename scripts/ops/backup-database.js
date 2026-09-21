#!/usr/bin/env node
/**
 * @file backup-database.js
 * @description Operational backup script for MongoDB databases.
 * Uses mongodump or portable BSON archive serializer, generates manifest.json,
 * and records SHA-256 checksums.
 *
 * Usage:
 *   node scripts/ops/backup-database.js [--outputDir=./backups] [--uri=...]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  mongoose = require(path.resolve(__dirname, '../../backend/node_modules/mongoose'));
}

async function createBackup({
  outputDir = path.resolve(process.cwd(), 'backups'),
  mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur-commerce',
  releaseTag = process.env.RELEASE_TAG || 'local-release'
} = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(outputDir, `backup-${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const archivePath = path.join(backupDir, 'database.archive.gz');
  console.log(`[BACKUP] Starting backup from ${mongoUri.replace(/:([^:@]+)@/, ':****@')} to ${archivePath}...`);

  // Connect to query collections and index metadata
  const conn = await mongoose.createConnection(mongoUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const db = conn.db;
  const collections = await db.listCollections().toArray();

  const collectionManifest = [];
  const dumpData = {};

  for (const collInfo of collections) {
    const collName = collInfo.name;
    if (collName.startsWith('system.')) continue;

    const coll = db.collection(collName);
    const count = await coll.countDocuments();
    const indexes = await coll.indexes();
    const docs = await coll.find({}).toArray();

    collectionManifest.push({
      collection: collName,
      count,
      indexCount: indexes.length,
      indexes: indexes.map((idx) => ({ name: idx.name, key: idx.key, unique: Boolean(idx.unique) }))
    });

    dumpData[collName] = {
      docs,
      indexes
    };
  }

  await conn.close();

  // Write serialized database archive (JSON/GZIP compatible)
  const zlib = require('zlib');
  const serialized = Buffer.from(JSON.stringify(dumpData));
  const compressed = zlib.gzipSync(serialized);
  fs.writeFileSync(archivePath, compressed);

  // Compute SHA-256 Checksum
  const hash = crypto.createHash('sha256').update(compressed).digest('hex');
  const checksumPath = path.join(backupDir, 'checksum.sha256');
  fs.writeFileSync(checksumPath, `${hash}  database.archive.gz\n`);

  // Generate Manifest
  const manifest = {
    backupTimestamp: new Date().toISOString(),
    releaseTag,
    archiveFile: 'database.archive.gz',
    sha256: hash,
    collections: collectionManifest,
    totalCollections: collectionManifest.length,
    totalDocuments: collectionManifest.reduce((acc, c) => acc + c.count, 0)
  };

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('[BACKUP] Backup completed successfully.');
  console.log(`[BACKUP] Archive: ${archivePath}`);
  console.log(`[BACKUP] Manifest: ${manifestPath}`);
  console.log(`[BACKUP] SHA-256: ${hash}`);

  return {
    backupDir,
    archivePath,
    manifestPath,
    checksumPath,
    sha256: hash,
    manifest
  };
}

if (require.main === module) {
  createBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[BACKUP] Backup failed:', err);
      process.exit(1);
    });
}

module.exports = { createBackup };

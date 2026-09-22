#!/usr/bin/env node
/**
 * @file verify-backup-restore-runtime.js
 * @description Operational runtime verification for database backup and safe restore in clean Ubuntu CI:
 * 1. Seeds disposable source database with collections and compound indexes.
 * 2. Creates operational backup archive, manifest, and SHA-256 checksum.
 * 3. Proves corrupted archive checksum is rejected before decompression.
 * 4. Proves protected database targets are rejected.
 * 5. Restores into a separate disposable target database and verifies exact document counts and indexes.
 *
 * Usage:
 *   node scripts/ops/verify-backup-restore-runtime.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  mongoose = require(path.resolve(__dirname, '../../backend/node_modules/mongoose'));
}

const { createBackup } = require('./backup-database');
const { restoreDatabase, REQUIRED_APPLY_TOKEN } = require('./restore-database');

const mongoHost = process.env.MONGO_HOST || '127.0.0.1:27017';
const rootUser = process.env.MONGO_ROOT_USER || 'root';
const rootPass = process.env.MONGO_ROOT_PASSWORD || 'rootpassword';
const authParam = rootUser && rootPass ? `${encodeURIComponent(rootUser)}:${encodeURIComponent(rootPass)}@` : '';
const authSourceParam = rootUser && rootPass ? '?authSource=admin&directConnection=true' : '';

async function verifyBackupRestoreRuntime() {
  const sourceDbName = 'disposable_source_backup_db';
  const targetDbName = 'disposable_restored_target_db';
  const tempBackupDir = path.join(os.tmpdir(), `phase9-verify-backup-${Date.now()}`);

  console.log(`[BACKUP-RESTORE-RUNTIME-VERIFY] Connecting to MongoDB on ${mongoHost}...`);
  const checks = [];

  const sourceUri = `mongodb://${authParam}${mongoHost}/${sourceDbName}${authSourceParam}`;
  const targetUri = `mongodb://${authParam}${mongoHost}/${targetDbName}${authSourceParam}`;

  // 1. Seed Source Database
  const sourceConn = await mongoose.createConnection(sourceUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const sourceDb = sourceConn.db;

  const productsColl = sourceDb.collection('products');
  const ordersColl = sourceDb.collection('orders');

  await productsColl.deleteMany({});
  await ordersColl.deleteMany({});

  await productsColl.createIndex({ sku: 1 }, { unique: true, name: 'idx_sku_unique' });
  await ordersColl.createIndex({ customerId: 1, orderDate: -1 }, { name: 'idx_customer_order_date' });

  await productsColl.insertMany([
    { sku: 'PROD-001', name: 'Almond Honey Granola', price: 1200, inventory: 50 },
    { sku: 'PROD-002', name: 'Organic Walnut Kernel', price: 2400, inventory: 30 }
  ]);

  await ordersColl.insertMany([
    { orderNumber: 'ORD-2026-001', customerId: 'CUST-10', total: 3600, orderDate: new Date() }
  ]);

  const sourceProductCount = await productsColl.countDocuments();
  const sourceOrderCount = await ordersColl.countDocuments();
  const sourceProductIndexes = await productsColl.indexes();
  const sourceOrderIndexes = await ordersColl.indexes();

  await sourceConn.close();
  checks.push({ check: 'SOURCE_DATABASE_SEEDED', sourceDb: sourceDbName, status: 'PASSED' });
  console.log(`[BACKUP-RESTORE-RUNTIME-VERIFY] ✓ Seeded source database "${sourceDbName}" with products and orders.`);

  // 2. Execute Backup
  const backupResult = await createBackup({
    outputDir: tempBackupDir,
    mongoUri: sourceUri,
    releaseTag: 'ci-phase9-verification'
  });

  if (!fs.existsSync(backupResult.archivePath) || !fs.existsSync(backupResult.manifestPath)) {
    throw new Error('Backup failed to generate archive or manifest file');
  }
  checks.push({ check: 'BACKUP_CREATED_WITH_CHECKSUM', sha256: backupResult.sha256, status: 'PASSED' });
  console.log(`[BACKUP-RESTORE-RUNTIME-VERIFY] ✓ Backup created successfully (SHA-256: ${backupResult.sha256}).`);

  // 3. Test Checksum-Corruption Rejection
  console.log('[BACKUP-RESTORE-RUNTIME-VERIFY] Testing corrupted checksum rejection...');
  const corruptedBackupDir = path.join(tempBackupDir, 'corrupted-test');
  fs.mkdirSync(corruptedBackupDir, { recursive: true });
  fs.copyFileSync(backupResult.manifestPath, path.join(corruptedBackupDir, 'manifest.json'));

  // Corrupt the archive by mutating bytes
  const archiveBytes = fs.readFileSync(backupResult.archivePath);
  archiveBytes[0] = archiveBytes[0] ^ 0xFF;
  fs.writeFileSync(path.join(corruptedBackupDir, 'database.archive.gz'), archiveBytes);

  let corruptionRejected = false;
  try {
    await restoreDatabase({
      backupDir: corruptedBackupDir,
      targetDbName: 'corrupt_test_db',
      applyToken: REQUIRED_APPLY_TOKEN,
      mongoHost,
      user: rootUser,
      password: rootPass,
      authSource: 'admin',
      directConnection: true
    });
  } catch (err) {
    if (err.message.includes('Checksum mismatch')) {
      corruptionRejected = true;
    }
  }

  if (!corruptionRejected) {
    throw new Error('Security failure: Corrupted archive was not rejected by restore checksum guard!');
  }
  checks.push({ check: 'CORRUPTED_ARCHIVE_REJECTED', status: 'PASSED' });
  console.log('[BACKUP-RESTORE-RUNTIME-VERIFY] ✓ Corrupted archive successfully rejected by checksum validation.');

  // 4. Test Protected Database Name Rejection
  let protectedRejected = false;
  try {
    await restoreDatabase({
      backupDir: backupResult.backupDir,
      targetDbName: 'mevapur-commerce', // Protected database name
      applyToken: REQUIRED_APPLY_TOKEN,
      mongoHost,
      user: rootUser,
      password: rootPass,
      authSource: 'admin',
      directConnection: true
    });
  } catch (err) {
    if (err.message.includes('is protected')) {
      protectedRejected = true;
    }
  }

  if (!protectedRejected) {
    throw new Error('Security failure: Protected database target was not rejected!');
  }
  checks.push({ check: 'PROTECTED_DATABASE_TARGET_REJECTED', status: 'PASSED' });
  console.log('[BACKUP-RESTORE-RUNTIME-VERIFY] ✓ Protected database target "mevapur-commerce" safely rejected.');

  // 5. Restore into Separate Disposable Target Database
  console.log(`[BACKUP-RESTORE-RUNTIME-VERIFY] Restoring into separate target "${targetDbName}"...`);
  const restoreRes = await restoreDatabase({
    backupDir: backupResult.backupDir,
    targetDbName,
    applyToken: REQUIRED_APPLY_TOKEN,
    mongoHost,
    user: rootUser,
    password: rootPass,
    authSource: 'admin',
    directConnection: true
  });

  if (!restoreRes.success) {
    throw new Error('Database restore failed');
  }

  // 6. Verify restored counts and indexes in target database
  const targetConn = await mongoose.createConnection(targetUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const targetDb = targetConn.db;

  const restoredProducts = targetDb.collection('products');
  const restoredOrders = targetDb.collection('orders');

  const restoredProductCount = await restoredProducts.countDocuments();
  const restoredOrderCount = await restoredOrders.countDocuments();
  const restoredProductIndexes = await restoredProducts.indexes();
  const restoredOrderIndexes = await restoredOrders.indexes();

  if (restoredProductCount !== sourceProductCount || restoredOrderCount !== sourceOrderCount) {
    throw new Error(`Document count mismatch! Source: (${sourceProductCount}, ${sourceOrderCount}), Restored: (${restoredProductCount}, ${restoredOrderCount})`);
  }

  // Verify compound index was recreated
  const skuIndexExists = restoredProductIndexes.some((idx) => idx.name === 'idx_sku_unique' && idx.unique === true);
  const orderIndexExists = restoredOrderIndexes.some((idx) => idx.name === 'idx_customer_order_date');

  if (!skuIndexExists || !orderIndexExists) {
    throw new Error('Index verification failed on restored database');
  }

  checks.push({
    check: 'RESTORE_COUNTS_AND_INDEXES_VERIFIED',
    targetDb: targetDbName,
    productsRestored: restoredProductCount,
    ordersRestored: restoredOrderCount,
    indexesVerified: true,
    status: 'PASSED'
  });
  console.log(`[BACKUP-RESTORE-RUNTIME-VERIFY] ✓ Restored ${restoredProductCount} products and ${restoredOrderCount} orders into "${targetDbName}" with verified indexes.`);

  // Clean up disposable databases and temp directory
  await targetDb.dropDatabase();
  const cleanSourceConn = await mongoose.createConnection(sourceUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  await cleanSourceConn.db.dropDatabase();
  await cleanSourceConn.close();
  await targetConn.close();

  try {
    fs.rmSync(tempBackupDir, { recursive: true, force: true });
  } catch {}

  return {
    success: true,
    sourceDb: sourceDbName,
    targetDb: targetDbName,
    checks
  };
}

if (require.main === module) {
  verifyBackupRestoreRuntime()
    .then((rep) => {
      console.log(JSON.stringify(rep, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BACKUP-RESTORE-RUNTIME-VERIFY] Error:', err.message);
      process.exit(1);
    });
}

module.exports = { verifyBackupRestoreRuntime };

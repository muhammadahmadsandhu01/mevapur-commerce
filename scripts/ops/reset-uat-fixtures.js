#!/usr/bin/env node
/**
 * @file reset-uat-fixtures.js
 * @description Deterministic UAT fixture reset tool for Phase 10 Manual QA, Load Testing, and Launch Readiness.
 * Deletes strictly by exact manifest-owned IDs in reverse dependency order after verifying stable identity fingerprints.
 * Never uses dropDatabase(), collection.drop(), or broad wildcard deletions. Removes ownership record last.
 *
 * Usage:
 *   node scripts/ops/reset-uat-fixtures.js --apply-token=PHASE10_UAT_RESET_CONFIRMED [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  mongoose = require(path.resolve(__dirname, '../../backend/node_modules/mongoose'));
}

const REQUIRED_RESET_TOKEN = 'PHASE10_UAT_RESET_CONFIRMED';
const MANIFEST_PATH = path.resolve(__dirname, 'manifests/uat-fixture-manifest.json');
const OWNERSHIP_COLLECTION = '_uat_fixture_ownership';

function redactMongoUri(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/(mongodb(?:\+srv)?:\/\/)([^:@\s]+):([^@\s]+)@/g, '$1***:***@');
}

function parseAndValidateUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string' || rawUri.trim() === '') {
    throw new Error('Missing required environment variable: UAT_MONGODB_URI');
  }
  const uri = rawUri.trim();

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error(`Invalid MongoDB URI protocol in: ${redactMongoUri(uri)}`);
  }

  let parsed;
  try {
    parsed = new URL(uri.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://'));
  } catch (err) {
    throw new Error(`Failed to parse UAT_MONGODB_URI: ${redactMongoUri(err.message)}`);
  }

  const host = parsed.hostname.toLowerCase();
  const PROD_HOST_PATTERNS = ['prod', 'production', 'cluster0', 'mongodb.net', 'live'];
  for (const pat of PROD_HOST_PATTERNS) {
    if (host.includes(pat)) {
      throw new Error(`Safety check rejected: Hostname "${host}" indicates a production or remote cloud cluster. Only local disposable/test hosts are allowed.`);
    }
  }

  const dbName = parsed.pathname ? parsed.pathname.replace(/^\//, '').split('?')[0].trim() : '';
  if (!dbName) {
    throw new Error(`Safety check rejected: No database name specified in UAT_MONGODB_URI: ${redactMongoUri(uri)}`);
  }

  const normalizedDb = dbName.toLowerCase();
  const HARD_REJECT = new Set([
    'production',
    'staging',
    'admin',
    'config',
    'local',
    'mevapur-commerce',
    'mevapur_commerce',
    'mevapur'
  ]);

  if (HARD_REJECT.has(normalizedDb)) {
    throw new Error(`Safety check rejected: Database "${dbName}" in URI ${redactMongoUri(uri)} is a protected database name. Cannot seed or reset protected databases.`);
  }

  const ALLOWED_SUBSTRINGS = ['uat', 'test', 'disposable'];
  const isAllowed = ALLOWED_SUBSTRINGS.some((sub) => normalizedDb.includes(sub));
  if (!isAllowed) {
    throw new Error(`Safety check rejected: Database "${dbName}" must contain "uat", "test", or "disposable".`);
  }

  return { uri, dbName, host: parsed.host };
}

function validateEnvironment() {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const appEnv = (process.env.APP_ENV || '').toLowerCase();
  if (nodeEnv !== 'test' && appEnv !== 'development') {
    throw new Error(`Environment rejected: NODE_ENV must be "test" or APP_ENV must be "development". Current: NODE_ENV="${process.env.NODE_ENV || ''}", APP_ENV="${process.env.APP_ENV || ''}"`);
  }
}

function computeIdentityFingerprint(collectionName, documentId, identityFields) {
  const sortedEntries = Object.keys(identityFields || {})
    .sort()
    .map((k) => [k, identityFields[k]]);
  const payload = JSON.stringify({
    col: collectionName,
    id: String(documentId),
    ident: sortedEntries
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function resetUatFixtures({
  mongoUri = process.env.UAT_MONGODB_URI,
  applyToken = null,
  dryRun = false,
  manifestPath = MANIFEST_PATH
} = {}) {
  // 1. Safety Guard: Environment validation
  validateEnvironment();

  // 2. Safety Guard: Token validation
  if (applyToken !== REQUIRED_RESET_TOKEN) {
    throw new Error(`Reset rejected: Invalid or missing applyToken. Must provide exact --apply-token=${REQUIRED_RESET_TOKEN}`);
  }

  // 3. Safety Guard: Database URI validation
  const { uri } = parseAndValidateUri(mongoUri);

  // 4. Load manifest
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // 5. Connect to MongoDB
  let connection;
  try {
    connection = await mongoose.createConnection(uri).asPromise();
    const db = connection.db;

    // 6. Query dedicated ownership record
    const ownershipCol = db.collection(OWNERSHIP_COLLECTION);
    const ownershipRecord = await ownershipCol.findOne({ namespace: manifest.fixtureNamespace });

    if (!ownershipRecord) {
      return {
        status: 'NO_FIXTURES_TO_RESET',
        deletedCount: 0,
        message: `No active UAT fixtures registered under namespace "${manifest.fixtureNamespace}".`
      };
    }

    const insertedRecords = ownershipRecord.insertedRecords || [];
    const recordsByCollection = {};
    for (const rec of insertedRecords) {
      if (!recordsByCollection[rec.collection]) {
        recordsByCollection[rec.collection] = [];
      }
      recordsByCollection[rec.collection].push(rec);
    }

    // 7. Verification Phase (Check all fingerprints before deletion)
    const deletionPlan = [];
    for (const colName of manifest.cleanupOrder) {
      const records = recordsByCollection[colName] || [];
      const col = db.collection(colName);

      for (const rec of records) {
        const docId = new mongoose.Types.ObjectId(rec.documentId);
        const existingDoc = await col.findOne({ _id: docId });

        if (existingDoc) {
          // Recompute fingerprint from existing document's immutable identity fields
          const currentIdentityFields = {};
          for (const key of Object.keys(rec.identityFields || {})) {
            currentIdentityFields[key] = String(existingDoc[key]);
          }

          const currentFp = computeIdentityFingerprint(colName, rec.documentId, currentIdentityFields);
          if (currentFp !== rec.fingerprint) {
            throw new Error(`FIXTURE_OWNERSHIP_MISMATCH: Document "${rec.documentId}" in collection "${colName}" has mismatched immutable identity fingerprint. Expected "${rec.fingerprint}", found "${currentFp}". Deletion refused.`);
          }

          deletionPlan.push({
            collection: colName,
            id: docId,
            documentId: rec.documentId
          });
        }
      }
    }

    // 8. Dry-run handling
    if (dryRun) {
      return {
        status: 'DRY_RUN_SUCCESS',
        plannedDeletions: deletionPlan.length,
        message: `Dry run completed: ${deletionPlan.length} documents and 1 ownership record would be deleted. Zero database mutations performed.`
      };
    }

    // 9. Deletion Phase in Reverse Dependency Order
    let deletedCount = 0;
    for (const item of deletionPlan) {
      const result = await db.collection(item.collection).deleteOne({ _id: item.id });
      if (result.deletedCount > 0) {
        deletedCount += result.deletedCount;
      }
    }

    // 10. Remove Ownership Record Last
    await ownershipCol.deleteOne({ _id: ownershipRecord._id });

    // 11. Post-Reset Zero-Orphan Verification
    const allManifestIds = [];
    for (const records of Object.values(manifest.datasets)) {
      for (const r of records) {
        allManifestIds.push(new mongoose.Types.ObjectId(r._id));
      }
    }

    for (const colName of manifest.dependencyOrder) {
      const remainingCount = await db.collection(colName).countDocuments({
        _id: { $in: allManifestIds }
      });
      if (remainingCount !== 0) {
        throw new Error(`Post-reset verification failed: Found ${remainingCount} remaining fixture documents in collection "${colName}".`);
      }
    }

    const remainingOwnership = await ownershipCol.findOne({ namespace: manifest.fixtureNamespace });
    if (remainingOwnership) {
      throw new Error('Post-reset verification failed: Ownership record was not removed.');
    }

    return {
      status: 'RESET_SUCCESS',
      deletedCount,
      message: `Successfully reset ${deletedCount} deterministic UAT fixture documents and removed ownership record.`
    };
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

// CLI Execution Support
if (require.main === module) {
  const args = process.argv.slice(2);
  let applyToken = null;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--apply-token=')) {
      applyToken = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  resetUatFixtures({ applyToken, dryRun })
    .then((res) => {
      console.log(`[UAT_RESET] ${res.status}: ${res.message}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[UAT_RESET_ERROR] ${redactMongoUri(err.message)}`);
      process.exit(1);
    });
}

module.exports = {
  resetUatFixtures,
  REQUIRED_RESET_TOKEN
};

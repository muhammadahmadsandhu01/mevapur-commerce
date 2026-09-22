#!/usr/bin/env node
/**
 * @file seed-uat-fixtures.js
 * @description Deterministic UAT fixture seeder for Phase 10 Manual QA, Load Testing, and Launch Readiness.
 * Enforces 20 safety invariants, collision detection, idempotent execution, and compensating rollback.
 *
 * Usage:
 *   node scripts/ops/seed-uat-fixtures.js --apply-token=PHASE10_UAT_SEED_CONFIRMED [--dry-run]
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

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch {
  bcrypt = require(path.resolve(__dirname, '../../backend/node_modules/bcryptjs'));
}

const REQUIRED_SEED_TOKEN = 'PHASE10_UAT_SEED_CONFIRMED';
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

function convertMongoTypes(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertMongoTypes);

  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === '_id' && typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) {
      out[key] = new mongoose.Types.ObjectId(val);
    } else if (
      (key.endsWith('Id') || key === 'user' || key === 'order' || key === 'customer' || key === 'category' || key === 'payment') &&
      typeof val === 'string' &&
      /^[0-9a-fA-F]{24}$/.test(val)
    ) {
      out[key] = new mongoose.Types.ObjectId(val);
    } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      out[key] = new Date(val);
    } else if (typeof val === 'object' && val !== null) {
      out[key] = convertMongoTypes(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

async function seedUatFixtures({
  mongoUri = process.env.UAT_MONGODB_URI,
  applyToken = null,
  dryRun = false,
  manifestPath = MANIFEST_PATH,
  fixturePassword = process.env.UAT_FIXTURE_PASSWORD
} = {}) {
  // 1. Safety Guard: Environment validation
  validateEnvironment();

  // 2. Safety Guard: Token validation
  if (applyToken !== REQUIRED_SEED_TOKEN) {
    throw new Error(`Seed rejected: Invalid or missing applyToken. Must provide exact --apply-token=${REQUIRED_SEED_TOKEN}`);
  }

  // 3. Safety Guard: Database URI validation
  const { uri, dbName } = parseAndValidateUri(mongoUri);

  // 4. Provider mock enforcement
  process.env.EMAIL_MODE = 'mock';

  // 5. Load and validate manifest
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // 6. Resolve fixture password
  let plainPassword = fixturePassword;
  if (!plainPassword) {
    if (process.env.NODE_ENV === 'test') {
      plainPassword = 'UatSecureFixturePass2026!';
    } else {
      throw new Error('Missing required environment variable: UAT_FIXTURE_PASSWORD');
    }
  }
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  // 7. Connect to MongoDB
  let connection;
  try {
    connection = await mongoose.createConnection(uri).asPromise();
    const db = connection.db;

    // 8. Check existing ownership record for idempotency & drift
    const ownershipCol = db.collection(OWNERSHIP_COLLECTION);
    const existingOwnership = await ownershipCol.findOne({ namespace: manifest.fixtureNamespace });

    if (existingOwnership) {
      let isFullyIntact = true;
      for (const rec of existingOwnership.insertedRecords || []) {
        const col = db.collection(rec.collection);
        const existingDoc = await col.findOne({ _id: new mongoose.Types.ObjectId(rec.documentId) });
        if (!existingDoc) {
          isFullyIntact = false;
          break;
        }
        const currentFp = computeIdentityFingerprint(rec.collection, rec.documentId, rec.identityFields);
        if (currentFp !== rec.fingerprint) {
          isFullyIntact = false;
          break;
        }
      }

      if (isFullyIntact) {
        return {
          status: 'ALREADY_SEEDED',
          namespace: manifest.fixtureNamespace,
          recordCount: existingOwnership.insertedRecords ? existingOwnership.insertedRecords.length : 0,
          message: 'UAT fixtures already seeded and intact with matching manifest and fingerprints.'
        };
      } else {
        throw new Error('FIXTURE_DRIFT_DETECTED: Active fixture state has drifted from manifest. Run reset-uat-fixtures.js before reseeding.');
      }
    }

    // 9. Collision detection checks
    for (const [colName, records] of Object.entries(manifest.datasets)) {
      const col = db.collection(colName);
      for (const record of records) {
        // Check exact _id collision
        const docId = new mongoose.Types.ObjectId(record._id);
        const existingById = await col.findOne({ _id: docId });
        if (existingById) {
          throw new Error(`FIXTURE_COLLISION_DETECTED: Target collection "${colName}" already contains document with ID "${record._id}"`);
        }

        // Check unique identity fields collisions
        if (record.identityFields) {
          const query = {};
          for (const [k, v] of Object.entries(record.identityFields)) {
            query[k] = v;
          }
          const existingByIdentity = await col.findOne(query);
          if (existingByIdentity) {
            throw new Error(`FIXTURE_COLLISION_DETECTED: Target collection "${colName}" already contains document matching identity "${JSON.stringify(record.identityFields)}"`);
          }
        }
      }
    }

    // 10. Dry-Run Handling
    if (dryRun) {
      return {
        status: 'DRY_RUN_SUCCESS',
        expectedCounts: manifest.expectedCounts,
        message: 'Dry run completed successfully with zero database mutations.'
      };
    }

    // 11. Seeding Execution with Compensating Cleanup Tracking
    const insertedByCurrentRun = [];
    try {
      for (const colName of manifest.dependencyOrder) {
        const records = manifest.datasets[colName] || [];
        const col = db.collection(colName);

        for (const record of records) {
          const fingerprint = computeIdentityFingerprint(colName, record._id, record.identityFields);
          const rawDoc = JSON.parse(JSON.stringify(record));
          delete rawDoc.identityFields;

          if (colName === 'users') {
            rawDoc.password = hashedPassword;
          }

          const docToInsert = convertMongoTypes(rawDoc);
          await col.insertOne(docToInsert);

          insertedByCurrentRun.push({
            collection: colName,
            documentId: String(record._id),
            identityFields: record.identityFields,
            fingerprint
          });
        }
      }

      // Record Ownership Document
      const ownershipDoc = {
        namespace: manifest.fixtureNamespace,
        fixtureSpecificationVersion: manifest.specificationVersion,
        seedRunId: crypto.randomUUID(),
        collections: manifest.dependencyOrder,
        insertedRecords: insertedByCurrentRun.map((r) => ({
          collection: r.collection,
          documentId: r.documentId,
          identityFields: r.identityFields,
          fingerprint: r.fingerprint,
          status: 'INSERTED'
        })),
        status: 'COMPLETED',
        createdAt: new Date(),
        seederVersion: '1.0.0'
      };
      await ownershipCol.insertOne(ownershipDoc);

      // Verify counts
      for (const [colName, expected] of Object.entries(manifest.expectedCounts)) {
        const count = await db.collection(colName).countDocuments({
          _id: { $in: manifest.datasets[colName].map((r) => new mongoose.Types.ObjectId(r._id)) }
        });
        if (count !== expected) {
          throw new Error(`Post-seed count mismatch in "${colName}": expected ${expected}, got ${count}`);
        }
      }

      return {
        status: 'SEEDED_SUCCESS',
        namespace: manifest.fixtureNamespace,
        recordCount: insertedByCurrentRun.length,
        message: `Successfully seeded ${insertedByCurrentRun.length} deterministic UAT fixtures.`
      };
    } catch (insertErr) {
      // Compensating Cleanup in Reverse Dependency Order
      for (const item of [...insertedByCurrentRun].reverse()) {
        try {
          await db.collection(item.collection).deleteOne({ _id: new mongoose.Types.ObjectId(item.documentId) });
        } catch {}
      }
      throw new Error(`Seeding failed (compensating cleanup executed): ${redactMongoUri(insertErr.message)}`);
    }
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

  seedUatFixtures({ applyToken, dryRun })
    .then((res) => {
      console.log(`[UAT_SEED] ${res.status}: ${res.message}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[UAT_SEED_ERROR] ${redactMongoUri(err.message)}`);
      process.exit(1);
    });
}

module.exports = {
  seedUatFixtures,
  parseAndValidateUri,
  validateEnvironment,
  computeIdentityFingerprint,
  REQUIRED_SEED_TOKEN
};

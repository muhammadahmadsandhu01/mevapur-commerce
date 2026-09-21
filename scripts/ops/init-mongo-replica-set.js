#!/usr/bin/env node
/**
 * @file init-mongo-replica-set.js
 * @description Idempotently initializes the MongoDB single-node replica set (rs0),
 * creates the administrative root user, and provisions the least-privileged application user.
 *
 * Usage:
 *   node scripts/ops/init-mongo-replica-set.js
 */

'use strict';

const mongoose = require('mongoose');

const mongoHost = process.env.MONGO_HOST || 'mongodb:27017';
const rootUser = process.env.MONGO_INITDB_ROOT_USERNAME || 'root';
const rootPass = process.env.MONGO_INITDB_ROOT_PASSWORD || 'rootpassword';
const appDb = process.env.MONGO_APP_DATABASE || 'mevapur-commerce';
const appUser = process.env.MONGO_APP_USER || 'app_user';
const appPass = process.env.MONGO_APP_PASSWORD || 'app_password';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initReplicaSet() {
  console.log(`[MONGO-INIT] Connecting to MongoDB on ${mongoHost}...`);

  // Direct connection without replicaSet query param initially
  const directUri = `mongodb://${mongoHost}/admin?directConnection=true`;

  let connected = false;
  let attempts = 0;
  while (!connected && attempts < 30) {
    attempts++;
    try {
      await mongoose.connect(directUri, { serverSelectionTimeoutMS: 2000 });
      connected = true;
      console.log('[MONGO-INIT] Connected to MongoDB daemon directly.');
    } catch (err) {
      console.log(`[MONGO-INIT] Waiting for MongoDB to be ready (attempt ${attempts}/30)...`);
      await sleep(2000);
    }
  }

  if (!connected) {
    console.error('[MONGO-INIT] Failed to connect to MongoDB daemon.');
    process.exit(1);
  }

  const adminDb = mongoose.connection.db.admin();

  // Step 1: Initialize replica set if not already initiated
  try {
    const status = await adminDb.command({ replSetGetStatus: 1 });
    console.log(`[MONGO-INIT] Replica set already active: ${status.set}`);
  } catch (err) {
    if (err.codeName === 'NotYetInitialized' || err.message.includes('no replSet')) {
      console.log('[MONGO-INIT] Initiating replica set rs0...');
      try {
        await adminDb.command({
          replSetInitiate: {
            _id: 'rs0',
            members: [{ _id: 0, host: mongoHost }]
          }
        });
        console.log('[MONGO-INIT] Replica set initiated successfully.');
      } catch (initErr) {
        if (!initErr.message.includes('already initialized')) {
          console.error('[MONGO-INIT] Failed to initiate replica set:', initErr.message);
          throw initErr;
        }
      }
    }
  }

  // Step 2: Wait for primary state
  console.log('[MONGO-INIT] Waiting for writable primary status...');
  let isPrimary = false;
  let primaryAttempts = 0;
  while (!isPrimary && primaryAttempts < 30) {
    primaryAttempts++;
    try {
      const hello = await adminDb.command({ hello: 1 });
      if (hello.isWritablePrimary) {
        isPrimary = true;
        console.log('[MONGO-INIT] Node is now writable primary.');
      } else {
        await sleep(1000);
      }
    } catch (err) {
      await sleep(1000);
    }
  }

  if (!isPrimary) {
    console.error('[MONGO-INIT] Node failed to become primary in time.');
    process.exit(1);
  }

  // Step 3: Idempotently create administrative root user if provided
  if (rootUser && rootPass) {
    try {
      await adminDb.command({
        createUser: rootUser,
        pwd: rootPass,
        roles: [{ role: 'root', db: 'admin' }]
      });
      console.log(`[MONGO-INIT] Root administrative user "${rootUser}" created.`);
    } catch (err) {
      if (err.codeName === 'UserAlreadyExists' || err.message.includes('already exists')) {
        console.log(`[MONGO-INIT] Root user "${rootUser}" already exists.`);
      } else {
        console.warn(`[MONGO-INIT] Note on root user creation: ${err.message}`);
      }
    }
  }

  // Step 4: Idempotently create least-privileged application user on application database
  if (appUser && appPass) {
    const targetDb = mongoose.connection.useDb(appDb);
    try {
      await targetDb.command({
        createUser: appUser,
        pwd: appPass,
        roles: [
          { role: 'readWrite', db: appDb }
        ]
      });
      console.log(`[MONGO-INIT] Least-privileged app user "${appUser}" created on "${appDb}".`);
    } catch (err) {
      if (err.codeName === 'UserAlreadyExists' || err.message.includes('already exists')) {
        console.log(`[MONGO-INIT] App user "${appUser}" already exists on "${appDb}".`);
      } else {
        console.warn(`[MONGO-INIT] Note on app user creation: ${err.message}`);
      }
    }
  }

  await mongoose.disconnect();
  console.log('[MONGO-INIT] Replica set and user provisioning completed.');
  process.exit(0);
}

if (require.main === module) {
  initReplicaSet().catch((err) => {
    console.error('[MONGO-INIT] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { initReplicaSet };

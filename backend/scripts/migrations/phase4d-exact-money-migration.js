#!/usr/bin/env node
'use strict';

/**
 * @file phase4d-exact-money-migration.js
 * @description Dedicated CLI runner for Phase 4D exact-money and legacy identity backfill.
 *
 * Supported modes:
 *   --inventory : Read-only evaluation and status breakdown across all 8 required models.
 *   --dry-run   : Read-only simulation of updates.
 *   --apply     : Bounded batch migration of exact money and normalized identity fields.
 *   --verify    : Independent verification scan recording MigrationState completion evidence.
 *   --rollback  : Idempotent rollback of migration-owned fields.
 */

const mongoose = require('mongoose');
const {
  MigrationGuardError,
  parseMigrationCli,
  validateTargetAndDbConfig
} = require('../lib/migrationRuntimeGuard');
const {
  ExactMoneyMigrationService,
  ExactMoneyMigrationRegistry
} = require('../../modules/commerce/migration');
const CurrencyRegistry = require('../../modules/commerce/registries/currencyRegistry');

const ALLOWED_MODES = ['--inventory', '--dry-run', '--apply', '--verify', '--rollback'];
const ALLOWED_FLAGS = [
  '--confirm-phase4d-apply',
  '--confirm-phase4d-rollback',
  '--confirm-production',
  '--allow-local',
  '--expected-db-fingerprint=',
  '--expected-registry-snapshot=',
  '--legacy-country=',
  '--legacy-currency=',
  '--batch-size='
];

const REQUIRED_CONFIRMATION_MAP = {
  apply: {
    staging: ['--confirm-phase4d-apply'],
    production: ['--confirm-phase4d-apply', '--confirm-production'],
    local: ['--confirm-phase4d-apply']
  },
  rollback: {
    staging: ['--confirm-phase4d-rollback'],
    production: ['--confirm-phase4d-rollback', '--confirm-production'],
    local: ['--confirm-phase4d-rollback']
  }
};

function parseCustomFlags(argv) {
  const custom = {
    expectedDbFingerprint: null,
    expectedRegistrySnapshot: null,
    legacyCountry: null,
    legacyCurrency: null,
    batchSize: 100
  };

  for (const arg of argv) {
    if (typeof arg !== 'string') continue;
    if (arg.startsWith('--expected-db-fingerprint=')) {
      custom.expectedDbFingerprint = arg.slice('--expected-db-fingerprint='.length).trim();
    } else if (arg.startsWith('--expected-registry-snapshot=')) {
      custom.expectedRegistrySnapshot = arg.slice('--expected-registry-snapshot='.length).trim();
    } else if (arg.startsWith('--legacy-country=')) {
      custom.legacyCountry = arg.slice('--legacy-country='.length).trim().toUpperCase();
    } else if (arg.startsWith('--legacy-currency=')) {
      custom.legacyCurrency = arg.slice('--legacy-currency='.length).trim().toUpperCase();
    } else if (arg.startsWith('--batch-size=')) {
      const b = parseInt(arg.slice('--batch-size='.length).trim(), 10);
      if (!Number.isNaN(b) && b > 0) custom.batchSize = b;
    }
  }

  return custom;
}

async function runCli(argv = process.argv.slice(2)) {
  const cli = parseMigrationCli(argv, {
    allowedModes: ALLOWED_MODES,
    allowedFlags: ALLOWED_FLAGS,
    requiredConfirmationMap: REQUIRED_CONFIRMATION_MAP
  });

  const customFlags = parseCustomFlags(argv);

  // Validate currency & country if passed
  if (customFlags.legacyCurrency && !CurrencyRegistry.has(customFlags.legacyCurrency)) {
    throw new MigrationGuardError(
      'INVALID_LEGACY_CURRENCY',
      `Provided --legacy-currency='${customFlags.legacyCurrency}' is not recognized in CurrencyRegistry.`
    );
  }

  // Pre-connection runtime configuration validation
  const dbConfig = validateTargetAndDbConfig({
    target: cli.target,
    hasAllowLocal: cli.hasAllowLocal
  });

  // Expected DB fingerprint check if provided on CLI
  if (customFlags.expectedDbFingerprint) {
    const exp = customFlags.expectedDbFingerprint.startsWith('sha256:')
      ? customFlags.expectedDbFingerprint.slice(7)
      : customFlags.expectedDbFingerprint;
    const computed = dbConfig.fingerprint;
    if (!computed.toLowerCase().startsWith(exp.toLowerCase())) {
      throw new MigrationGuardError(
        'DB_FINGERPRINT_MISMATCH',
        `Database fingerprint mismatch. Expected: ${customFlags.expectedDbFingerprint}, Computed: ${dbConfig.sanitizedFingerprint}`
      );
    }
  }

  // Expected Registry Snapshot check if provided
  if (customFlags.expectedRegistrySnapshot) {
    const currentSnapshot = ExactMoneyMigrationService.getRegistrySnapshot();
    if (customFlags.expectedRegistrySnapshot !== currentSnapshot) {
      throw new MigrationGuardError(
        'REGISTRY_SNAPSHOT_MISMATCH',
        `CurrencyRegistry snapshot mismatch. Expected: ${customFlags.expectedRegistrySnapshot}, Current: ${currentSnapshot}`
      );
    }
  }

  // Connect to MongoDB if not already connected
  const shouldManageConnection = mongoose.connection.readyState === 0;
  if (shouldManageConnection) {
    await mongoose.connect(dbConfig.mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
  }

  try {
    const options = {
      target: cli.target,
      legacyCountry: customFlags.legacyCountry,
      legacyCurrency: customFlags.legacyCurrency,
      batchSize: customFlags.batchSize
    };

    if (cli.mode === '--inventory') {
      const inv = await ExactMoneyMigrationService.inventory(options);
      console.log('=== Phase 4D Exact-Money Migration Inventory ===');
      console.log(JSON.stringify(inv, null, 2));
      return inv;
    }

    if (cli.mode === '--dry-run') {
      const dry = await ExactMoneyMigrationService.dryRun(options);
      console.log('=== Phase 4D Exact-Money Migration Dry-Run ===');
      console.log(JSON.stringify(dry, null, 2));
      return dry;
    }

    if (cli.mode === '--apply') {
      const applyRes = await ExactMoneyMigrationService.apply(options);
      console.log('=== Phase 4D Exact-Money Migration Applied ===');
      console.log(JSON.stringify(applyRes, null, 2));
      return applyRes;
    }

    if (cli.mode === '--verify') {
      const verifyRes = await ExactMoneyMigrationService.verify(options);
      console.log('=== Phase 4D Exact-Money Migration Verification ===');
      console.log(JSON.stringify(verifyRes, null, 2));
      return verifyRes;
    }

    if (cli.mode === '--rollback') {
      const rollbackRes = await ExactMoneyMigrationService.rollback(options);
      console.log('=== Phase 4D Exact-Money Migration Rollback ===');
      console.log(JSON.stringify(rollbackRes, null, 2));
      return rollbackRes;
    }
  } finally {
    if (shouldManageConnection) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error(`[MIGRATION_ERROR] ${err.name || 'Error'}: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  runCli,
  ALLOWED_MODES,
  ALLOWED_FLAGS,
  REQUIRED_CONFIRMATION_MAP
};

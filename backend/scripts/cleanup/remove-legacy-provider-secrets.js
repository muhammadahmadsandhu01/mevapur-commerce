#!/usr/bin/env node
'use strict';

const {
  LEGACY_PROVIDER_SECRET_PATHS
} = require('../../services/SettingSecurityService');

const APPLY_FLAG = '--apply';
const CONFIRMATION_FLAG = '--confirm-remove-provider-secrets';
const BACKUP_ACKNOWLEDGMENT_FLAG = '--backup-acknowledged';

class CleanupRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'CleanupRefusal';
    this.code = code;
  }
}

const parseCleanupArguments = (argv = []) => {
  const supported = new Set([
    APPLY_FLAG,
    CONFIRMATION_FLAG,
    BACKUP_ACKNOWLEDGMENT_FLAG
  ]);

  for (const argument of argv) {
    if (!supported.has(argument)) {
      throw new CleanupRefusal('LEGACY_SECRET_CLEANUP_ARGUMENT_UNSUPPORTED');
    }
  }

  const apply = argv.includes(APPLY_FLAG);
  const confirmed = argv.includes(CONFIRMATION_FLAG);
  const backupAcknowledged = argv.includes(BACKUP_ACKNOWLEDGMENT_FLAG);

  if (!apply && (confirmed || backupAcknowledged)) {
    throw new CleanupRefusal('LEGACY_SECRET_CLEANUP_APPLY_FLAG_REQUIRED');
  }
  if (apply && !confirmed) {
    throw new CleanupRefusal('LEGACY_SECRET_CLEANUP_CONFIRMATION_REQUIRED');
  }
  if (apply && !backupAcknowledged) {
    throw new CleanupRefusal('LEGACY_SECRET_CLEANUP_BACKUP_ACK_REQUIRED');
  }

  return Object.freeze({
    mode: apply ? 'apply' : 'dry-run',
    apply,
    confirmed,
    backupAcknowledged
  });
};

const createCleanupPlan = (options = parseCleanupArguments()) => {
  const fields = [...LEGACY_PROVIDER_SECRET_PATHS];
  return Object.freeze({
    collection: 'settings',
    mode: options.mode,
    fields: Object.freeze(fields),
    filter: {
      $or: fields.map((path) => ({ [path]: { $exists: true } }))
    },
    update: {
      $unset: Object.fromEntries(fields.map((path) => [path, '']))
    }
  });
};

const validateCleanupEnvironment = (environment = process.env) => {
  const uri = environment.MONGODB_URI;
  if (
    typeof uri !== 'string'
    || !/^mongodb(?:\+srv)?:\/\//i.test(uri.trim())
  ) {
    throw new CleanupRefusal('LEGACY_SECRET_CLEANUP_DATABASE_URI_REQUIRED');
  }
};

const executeCleanup = async ({ collection, plan, logger }) => {
  const matchedDocuments = await collection.countDocuments(plan.filter);

  if (plan.mode === 'dry-run') {
    logger.info('Legacy provider secret cleanup dry run completed', {
      mode: plan.mode,
      matchedDocuments,
      fieldNames: plan.fields
    });
    return {
      mode: plan.mode,
      matchedDocuments,
      modifiedDocuments: 0,
      fields: [...plan.fields]
    };
  }

  const result = await collection.updateMany(plan.filter, plan.update);
  const modifiedDocuments = result.modifiedCount || 0;
  logger.info('Legacy provider secret cleanup apply completed', {
    mode: plan.mode,
    matchedDocuments,
    modifiedDocuments,
    fieldNames: plan.fields
  });

  return {
    mode: plan.mode,
    matchedDocuments,
    modifiedDocuments,
    fields: [...plan.fields]
  };
};

const getDefaultDependencies = () => {
  const connectDatabase = require('../../config/db');
  const Setting = require('../../models/Setting');
  const logger = require('../../common/utils/logger');

  return {
    connectDatabase,
    disconnectDatabase: connectDatabase.closeDatabase,
    getCollection: () => Setting.collection,
    logger
  };
};

const runCleanup = async ({
  argv = process.argv.slice(2),
  environment = process.env,
  dependencies
} = {}) => {
  const options = parseCleanupArguments(argv);
  validateCleanupEnvironment(environment);
  const plan = createCleanupPlan(options);
  const runtime = dependencies || getDefaultDependencies();

  await runtime.connectDatabase();
  try {
    return await executeCleanup({
      collection: runtime.getCollection(),
      plan,
      logger: runtime.logger
    });
  } finally {
    await runtime.disconnectDatabase();
  }
};

const main = async () => {
  require('dotenv').config();
  const logger = require('../../common/utils/logger');

  try {
    await runCleanup();
  } catch (error) {
    logger.error('Legacy provider secret cleanup refused or failed safely', {
      errorCode: error.code || 'LEGACY_SECRET_CLEANUP_FAILED',
      errorName: error.name
    });
    process.exitCode = 1;
  }
};

if (require.main === module) {
  void main();
}

module.exports = {
  APPLY_FLAG,
  BACKUP_ACKNOWLEDGMENT_FLAG,
  CONFIRMATION_FLAG,
  CleanupRefusal,
  LEGACY_PROVIDER_SECRET_PATHS,
  createCleanupPlan,
  executeCleanup,
  parseCleanupArguments,
  runCleanup,
  validateCleanupEnvironment
};

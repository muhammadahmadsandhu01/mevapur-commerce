/**
 * @file phase8-notifications-invoices-exceptions.js
 * @description Additive Index & Schema Initialization Script for Phase 8
 * (Notifications, Invoices, and Customer Operations Exceptions).
 * Safe, idempotent, dry-run by default, with apply-token enforcement.
 *
 * Usage:
 *   node backend/scripts/migrations/phase8-notifications-invoices-exceptions.js [--dry-run] [--apply] [--apply-token=PHASE8_APPLY_CONFIRM]
 */

'use strict';

const mongoose = require('mongoose');
const TransactionalMessage = require('../../models/TransactionalMessage');
const OrderDocument = require('../../models/OrderDocument');
const CustomerOperationException = require('../../models/CustomerOperationException');
const logger = require('../../utils/logger');

const REQUIRED_APPLY_TOKEN = 'PHASE8_APPLY_CONFIRM';

async function runMigration({
  apply = false,
  applyToken = null,
  targetEnv = process.env.NODE_ENV || 'development'
} = {}) {
  if (apply && applyToken !== REQUIRED_APPLY_TOKEN) {
    throw new Error(`Explicit valid apply token is required to execute migration. Pass --apply-token=${REQUIRED_APPLY_TOKEN}`);
  }

  const actions = [];

  // 1. TransactionalMessage Indexes
  actions.push({
    modelName: 'TransactionalMessage',
    index: { dedupKey: 1 },
    options: { unique: true, name: 'unique_transactional_message_dedup' }
  });
  actions.push({
    modelName: 'TransactionalMessage',
    index: { status: 1, nextAttemptAt: 1 },
    options: { name: 'idx_outbox_worker_schedule' }
  });
  actions.push({
    modelName: 'TransactionalMessage',
    index: { status: 1, leaseExpiresAt: 1 },
    options: { name: 'idx_outbox_lease_expiry' }
  });
  actions.push({
    modelName: 'TransactionalMessage',
    index: { domainType: 1, domainId: 1 },
    options: { name: 'idx_outbox_domain_ref' }
  });

  // 2. OrderDocument Indexes
  actions.push({
    modelName: 'OrderDocument',
    index: { documentNumber: 1 },
    options: { unique: true, name: 'unique_document_number' }
  });
  actions.push({
    modelName: 'OrderDocument',
    index: { order: 1, documentType: 1, status: 1 },
    options: { name: 'idx_order_doctype_status' }
  });
  actions.push({
    modelName: 'OrderDocument',
    index: { customer: 1, createdAt: -1 },
    options: { name: 'idx_customer_documents' }
  });

  // 3. CustomerOperationException Indexes
  actions.push({
    modelName: 'CustomerOperationException',
    index: { exceptionNumber: 1 },
    options: { unique: true, name: 'unique_exception_number' }
  });
  actions.push({
    modelName: 'CustomerOperationException',
    index: { dedupKey: 1 },
    options: { unique: true, name: 'unique_exception_dedup_key' }
  });
  actions.push({
    modelName: 'CustomerOperationException',
    index: { status: 1, severity: 1, createdAt: -1 },
    options: { name: 'idx_exception_status_severity' }
  });
  actions.push({
    modelName: 'CustomerOperationException',
    index: { type: 1, status: 1 },
    options: { name: 'idx_exception_type_status' }
  });
  actions.push({
    modelName: 'CustomerOperationException',
    index: { customer: 1, createdAt: -1 },
    options: { name: 'idx_customer_exceptions' }
  });
  actions.push({
    modelName: 'CustomerOperationException',
    index: { order: 1 },
    options: { name: 'idx_order_exceptions' }
  });

  const report = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    targetEnv,
    totalPlannedIndexActions: actions.length,
    indexesCreated: 0,
    indexesSkipped: 0,
    actionsReport: []
  };

  const models = {
    TransactionalMessage,
    OrderDocument,
    CustomerOperationException
  };

  for (const action of actions) {
    const Model = models[action.modelName];
    if (!Model) continue;

    const collection = Model.collection;
    let exists = false;
    try {
      const existingIndexes = await collection.indexes();
      exists = existingIndexes.some((idx) => {
        if (idx.name === action.options.name) return true;
        const existingKeys = Object.keys(idx.key || {});
        const actionKeys = Object.keys(action.index || {});
        if (existingKeys.length !== actionKeys.length) return false;
        return existingKeys.every((k) => idx.key[k] === action.index[k]);
      });
    } catch (_err) {
      exists = false;
    }

    if (exists) {
      report.indexesSkipped += 1;
      report.actionsReport.push({
        model: action.modelName,
        index: action.options.name,
        status: 'SKIPPED_ALREADY_EXISTS'
      });
    } else {
      if (apply) {
        await collection.createIndex(action.index, action.options);
        report.indexesCreated += 1;
        report.actionsReport.push({
          model: action.modelName,
          index: action.options.name,
          status: 'CREATED'
        });
      } else {
        report.actionsReport.push({
          model: action.modelName,
          index: action.options.name,
          status: 'PLANNED'
        });
      }
    }
  }

  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const tokenArg = args.find((a) => a.startsWith('--apply-token='));
  const applyToken = tokenArg ? tokenArg.split('=')[1] : null;

  runMigration({ apply: isApply, applyToken })
    .then((report) => {
      console.log('Phase 8 Migration Report:', JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Phase 8 Migration failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runMigration,
  REQUIRED_APPLY_TOKEN
};

/**
 * @file phase7-returns-refunds-disputes.js
 * @description Additive Index & Schema Initialization Script for Phase 7 (Returns, Refunds, Disputes & Finance Reconciliation).
 * Safe, idempotent, dry-run by default, with apply-token enforcement.
 *
 * Usage:
 *   node backend/scripts/migrations/phase7-returns-refunds-disputes.js [--dry-run] [--apply] [--apply-token=PHASE7_APPLY_CONFIRM]
 */

'use strict';

const mongoose = require('mongoose');
const Return = require('../../models/Return');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const PaymentDispute = require('../../models/PaymentDispute');
const Refund = require('../../models/Refund');
const logger = require('../../utils/logger');

const REQUIRED_APPLY_TOKEN = 'PHASE7_APPLY_CONFIRM';

async function runMigration({
  apply = false,
  applyToken = null,
  targetEnv = process.env.NODE_ENV || 'development'
} = {}) {
  if (apply && applyToken !== REQUIRED_APPLY_TOKEN) {
    throw new Error(`Explicit valid apply token is required to execute migration. Pass --apply-token=${REQUIRED_APPLY_TOKEN}`);
  }

  const actions = [];

  // 1. PaymentDispute Indexes
  actions.push({
    modelName: 'PaymentDispute',
    index: { provider: 1, providerDisputeId: 1 },
    options: { unique: true, name: 'unique_provider_dispute_reference' }
  });
  actions.push({
    modelName: 'PaymentDispute',
    index: { payment: 1, status: 1 },
    options: { name: 'idx_dispute_payment_status' }
  });
  actions.push({
    modelName: 'PaymentDispute',
    index: { order: 1 },
    options: { name: 'idx_dispute_order' }
  });
  actions.push({
    modelName: 'PaymentDispute',
    index: { customer: 1, createdAt: -1 },
    options: { name: 'idx_dispute_customer' }
  });

  // 2. Return Indexes
  actions.push({
    modelName: 'Return',
    index: { routingStatus: 1 },
    options: { name: 'idx_return_routing_status' }
  });
  actions.push({
    modelName: 'Return',
    index: { isRto: 1 },
    options: { sparse: true, name: 'idx_return_rto' }
  });

  // 3. Order Indexes
  actions.push({
    modelName: 'Order',
    index: { isRto: 1 },
    options: { sparse: true, name: 'idx_order_rto' }
  });

  const report = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    targetEnv,
    totalPlannedIndexActions: actions.length,
    indexesCreated: 0,
    indexesSkipped: 0,
    backfillStats: {
      ordersUpdated: 0,
      returnsUpdated: 0
    },
    actionsReport: []
  };

  const models = {
    PaymentDispute,
    Return,
    Order,
    Payment,
    Refund
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

  // Backfill policy snapshots on orders if missing
  const ordersWithoutSnapshot = await Order.countDocuments({ returnPolicySnapshot: null });
  if (apply && ordersWithoutSnapshot > 0) {
    const updateResult = await Order.updateMany(
      { returnPolicySnapshot: null },
      {
        $set: {
          returnPolicySnapshot: {
            windowDays: 30,
            eligibleStatus: 'Delivered',
            restockingFeePercentage: 0,
            restockingFeeExact: null,
            returnShippingCostPayer: 'CUSTOMER',
            nonReturnableCategories: [],
            requireApproval: true,
            allowPartialReturns: true,
            policyVersion: '7.0',
            snapshotCreatedAt: new Date()
          }
        }
      }
    );
    report.backfillStats.ordersUpdated = updateResult.modifiedCount;
  } else {
    report.backfillStats.ordersUpdated = ordersWithoutSnapshot;
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
      console.log('Phase 7 Migration Report:', JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runMigration,
  REQUIRED_APPLY_TOKEN
};

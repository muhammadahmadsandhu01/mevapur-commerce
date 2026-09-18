/**
 * @file phase6d5-checkout-sessions-init.js
 * @description Additive Index & Schema Initialization Script for Phase 6D-5A.
 * Safe, idempotent, and dry-run by default.
 *
 * Usage:
 *   node backend/scripts/migrations/phase6d5-checkout-sessions-init.js [--apply]
 */

'use strict';

const mongoose = require('mongoose');
const InventoryHold = require('../../models/InventoryHold');
const CheckoutSession = require('../../models/CheckoutSession');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const InventoryLedger = require('../../models/InventoryLedger');
const logger = require('../../utils/logger');

async function runIndexMigration({ apply = false, targetEnv = process.env.NODE_ENV || 'development', force = false } = {}) {
  if (apply && !targetEnv) {
    throw new Error('Explicit target environment is required to apply index migration');
  }
  const actions = [];

  // 1. InventoryHold Indexes
  actions.push({
    modelName: 'InventoryHold',
    index: { holdKey: 1 },
    options: { unique: true, name: 'unique_inventory_hold_key' }
  });
  actions.push({
    modelName: 'InventoryHold',
    index: { merchantScopeId: 1, sessionId: 1 },
    options: { unique: true, name: 'unique_tenant_session_hold' }
  });
  actions.push({
    modelName: 'InventoryHold',
    index: { status: 1, expiresAt: 1 },
    options: { name: 'hold_expiry_reconciliation_idx' }
  });

  // 2. CheckoutSession Indexes
  actions.push({
    modelName: 'CheckoutSession',
    index: { sessionId: 1 },
    options: { unique: true, name: 'unique_checkout_session_id' }
  });
  actions.push({
    modelName: 'CheckoutSession',
    index: { merchantScopeId: 1, idempotencyKey: 1 },
    options: {
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } },
      name: 'unique_tenant_session_idempotency'
    }
  });
  actions.push({
    modelName: 'CheckoutSession',
    index: { convertedOrderId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { convertedOrderId: { $type: 'objectId' } },
      name: 'unique_converted_order_id'
    }
  });
  actions.push({
    modelName: 'CheckoutSession',
    index: { status: 1, leaseExpiresAt: 1 },
    options: { name: 'session_expiry_reconciliation_idx' }
  });

  // 3. Order Indexes
  actions.push({
    modelName: 'Order',
    index: { checkoutSessionObjectId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { checkoutSessionObjectId: { $type: 'objectId' } },
      name: 'unique_order_checkout_session_object_id'
    }
  });
  actions.push({
    modelName: 'Order',
    index: { checkoutSessionId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { checkoutSessionId: { $type: 'string', $gt: '' } },
      name: 'unique_order_checkout_session_id'
    }
  });

  // 4. Payment Indexes
  actions.push({
    modelName: 'Payment',
    index: { checkoutSessionObjectId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        checkoutSessionObjectId: { $type: 'objectId' },
        status: {
          $in: [
            'Pending',
            'Processing',
            'RequiresCustomerAction',
            'Authorized',
            'AwaitingCustomerPayment',
            'AwaitingVerification'
          ]
        }
      },
      name: 'unique_active_session_payment'
    }
  });

  console.log(`[Phase 6D-5A Migration] Found ${actions.length} target indexes across models.`);

  const results = [];
  for (const act of actions) {
    if (apply) {
      const model = mongoose.model(act.modelName);
      await model.collection.createIndex(act.index, act.options);
      results.push({ action: 'CREATED', ...act });
    } else {
      results.push({ action: 'DRY_RUN_WOULD_CREATE', ...act });
    }
  }

  return {
    mode: apply ? 'APPLIED' : 'DRY_RUN',
    indexCount: results.length,
    results
  };
}

// CLI execution
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const connectDB = require('../../config/db');

  const args = process.argv.slice(2);
  const apply = args.includes('--apply');

  (async () => {
    try {
      await connectDB();
      const output = await runIndexMigration({ apply });
      console.log('MIGRATION_RESULT:', JSON.stringify(output, null, 2));
      process.exit(0);
    } catch (err) {
      console.error('MIGRATION_ERROR:', err);
      process.exit(1);
    }
  })();
}

module.exports = {
  runIndexMigration,
  runMigration: runIndexMigration
};

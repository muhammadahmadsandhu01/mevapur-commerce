/**
 * @file reconcileExpiredCheckoutSessions.js
 * @description Operational worker CLI script for expiring overdue CheckoutSessions
 * and atomically releasing their associated InventoryHold leases.
 *
 * Usage:
 *   node backend/scripts/workers/reconcileExpiredCheckoutSessions.js [--dryRun] [--batchSize=100] [--merchantScopeId=default]
 */

'use strict';

const mongoose = require('mongoose');
const CheckoutSession = require('../../models/CheckoutSession');
const InventoryHold = require('../../models/InventoryHold');
const StockHoldLeaseService = require('../../services/inventory/StockHoldLeaseService');
const logger = require('../../utils/logger');

let isProcessing = false;

async function reconcileExpiredCheckoutSessions({
  merchantScopeId = null,
  batchSize = 100,
  dryRun = false,
  now = new Date()
} = {}) {
  if (isProcessing) {
    logger.warn('Expiry worker run already in progress; skipping overlapping run');
    return { skipped: true };
  }
  isProcessing = true;

  try {
    const filter = {
      status: {
        $in: [
          CheckoutSession.STATUSES.ACTIVE,
          CheckoutSession.STATUSES.PAYMENT_PENDING
        ]
      },
      leaseExpiresAt: { $lte: now }
    };
    if (merchantScopeId) {
      filter.merchantScopeId = merchantScopeId;
    }

    const expiredSessions = await CheckoutSession.find(filter)
      .sort({ leaseExpiresAt: 1 })
      .limit(batchSize);

    logger.info('Checkout session expiry scan completed', {
      candidateCount: expiredSessions.length,
      dryRun,
      merchantScopeId: merchantScopeId || 'ALL'
    });

    let expiredCount = 0;
    let failedCount = 0;

    for (const sessionDoc of expiredSessions) {
      if (dryRun) {
        logger.info('[DRY RUN] Would expire session', {
          sessionId: sessionDoc.sessionId,
          leaseExpiresAt: sessionDoc.leaseExpiresAt,
          merchantScopeId: sessionDoc.merchantScopeId
        });
        expiredCount += 1;
        continue;
      }

      const mongoSession = await mongoose.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          // 1. Claim session atomically
          const claimedSession = await CheckoutSession.findOneAndUpdate(
            {
              _id: sessionDoc._id,
              status: {
                $in: [
                  CheckoutSession.STATUSES.ACTIVE,
                  CheckoutSession.STATUSES.PAYMENT_PENDING
                ]
              },
              lockVersion: sessionDoc.lockVersion
            },
            {
              $set: { status: CheckoutSession.STATUSES.EXPIRED },
              $inc: { lockVersion: 1 }
            },
            { session: mongoSession, new: true }
          );

          if (!claimedSession) {
            return; // Concurrent modification
          }

          // 2. Atomically release the hold lease
          await StockHoldLeaseService.releaseHold({
            holdId: sessionDoc.inventoryHoldId,
            sessionId: sessionDoc.sessionId,
            merchantScopeId: sessionDoc.merchantScopeId,
            releaseReason: 'EXPIRED_UNPAID',
            session: mongoSession
          });
        });

        expiredCount += 1;
      } catch (err) {
        failedCount += 1;
        logger.error('Failed to expire checkout session atomically', {
          sessionId: sessionDoc.sessionId,
          errorCode: err.code || err.name,
          message: err.message
        });
      } finally {
        await mongoSession.endSession();
      }
    }

    logger.info('Checkout session expiry reconciliation finished', {
      processed: expiredSessions.length,
      expiredCount,
      failedCount,
      dryRun
    });

    return {
      evaluated: expiredSessions.length,
      processed: expiredSessions.length,
      expiredCount,
      failedCount
    };
  } finally {
    isProcessing = false;
  }
}

// CLI Execution Support
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const connectDB = require('../../config/db');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dryRun') || args.includes('-d');
  const batchArg = args.find((a) => a.startsWith('--batchSize='));
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1], 10) || 100 : 100;
  const merchantArg = args.find((a) => a.startsWith('--merchantScopeId='));
  const merchantScopeId = merchantArg ? merchantArg.split('=')[1] : null;

  (async () => {
    try {
      await connectDB();
      const summary = await reconcileExpiredCheckoutSessions({ merchantScopeId, batchSize, dryRun });
      console.log('RECONCILE_CHECKOUT_SESSIONS_SUCCESS', JSON.stringify(summary));
      process.exit(0);
    } catch (err) {
      console.error('RECONCILE_CHECKOUT_SESSIONS_ERROR', err);
      process.exit(1);
    }
  })();
}

module.exports = { reconcileExpiredCheckoutSessions };

/**
 * @file purgeAbandonedCheckoutSessions.js
 * @description Operational worker CLI script for safely redacting PII
 * from abandoned, terminal CheckoutSessions (expired, cancelled, failed)
 * past their governed data retention period (default 30 days).
 *
 * Invariants:
 * - NEVER redacts converted, payment_captured, converting, or conflict sessions.
 * - NEVER deletes financial amounts or inventory hold audit linkages.
 * - Idempotent: Skips already-redacted sessions (redactedAt != null).
 *
 * Usage:
 *   node backend/scripts/workers/purgeAbandonedCheckoutSessions.js [--dryRun] [--retentionDays=30] [--batchSize=100]
 */

'use strict';

const mongoose = require('mongoose');
const CheckoutSession = require('../../models/CheckoutSession');
const logger = require('../../utils/logger');

let isProcessing = false;

async function purgeAbandonedCheckoutSessions({
  merchantScopeId = null,
  retentionDays = 30,
  batchSize = 100,
  dryRun = false,
  now = new Date()
} = {}) {
  if (isProcessing) {
    logger.warn('PII purge worker run already in progress; skipping overlapping run');
    return { skipped: true };
  }
  isProcessing = true;

  try {
    const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 3600 * 1000);

    const filter = {
      status: {
        $in: [
          CheckoutSession.STATUSES.EXPIRED,
          CheckoutSession.STATUSES.CANCELLED,
          CheckoutSession.STATUSES.FAILED
        ]
      },
      redactedAt: null,
      updatedAt: { $lte: cutoffDate }
    };
    if (merchantScopeId) {
      filter.merchantScopeId = merchantScopeId;
    }

    const eligibleSessions = await CheckoutSession.find(filter)
      .sort({ updatedAt: 1 })
      .limit(batchSize);

    logger.info('Abandoned session PII purge scan completed', {
      eligibleCount: eligibleSessions.length,
      retentionDays,
      cutoffDate,
      dryRun
    });

    let redactedCount = 0;
    let errorCount = 0;

    for (const sessionDoc of eligibleSessions) {
      if (dryRun) {
        logger.info('[DRY RUN] Would redact PII from session', {
          sessionId: sessionDoc.sessionId,
          status: sessionDoc.status,
          updatedAt: sessionDoc.updatedAt
        });
        redactedCount += 1;
        continue;
      }

      try {
        await CheckoutSession.updateOne(
          {
            _id: sessionDoc._id,
            redactedAt: null,
            status: sessionDoc.status
          },
          {
            $set: {
              customerEmail: '[REDACTED]',
              'orderData.shippingAddress.fullName': '[REDACTED]',
              'orderData.shippingAddress.addressLine1': '[REDACTED]',
              'orderData.shippingAddress.addressLine2': '',
              'orderData.shippingAddress.phone': '',
              'orderData.shippingAddress.phoneE164': null,
              'orderData.shippingAddress.postalCode': '',
              'orderData.customerNote': '',
              redactedAt: now
            },
            $inc: { lockVersion: 1 }
          }
        );
        redactedCount += 1;
      } catch (err) {
        errorCount += 1;
        logger.error('Failed to redact PII from session', {
          sessionId: sessionDoc.sessionId,
          message: err.message
        });
      }
    }

    logger.info('Abandoned session PII purge finished', {
      evaluated: eligibleSessions.length,
      redactedCount,
      errorCount,
      dryRun
    });

    return {
      evaluated: eligibleSessions.length,
      redactedCount,
      errorCount
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
  const retentionArg = args.find((a) => a.startsWith('--retentionDays='));
  const retentionDays = retentionArg ? parseInt(retentionArg.split('=')[1], 10) || 30 : 30;
  const merchantArg = args.find((a) => a.startsWith('--merchantScopeId='));
  const merchantScopeId = merchantArg ? merchantArg.split('=')[1] : null;

  (async () => {
    try {
      await connectDB();
      const summary = await purgeAbandonedCheckoutSessions({
        merchantScopeId,
        retentionDays,
        batchSize,
        dryRun
      });
      console.log('PURGE_ABANDONED_CHECKOUT_SESSIONS_SUCCESS', JSON.stringify(summary));
      process.exit(0);
    } catch (err) {
      console.error('PURGE_ABANDONED_CHECKOUT_SESSIONS_ERROR', err);
      process.exit(1);
    }
  })();
}

module.exports = { purgeAbandonedCheckoutSessions };

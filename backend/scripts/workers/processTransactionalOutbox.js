/**
 * @file processTransactionalOutbox.js
 * @description Operational worker CLI script for processing transactional notification
 * outbox records with lease-based locking, retry backoff, and dead-letter exception forwarding.
 *
 * Invariants:
 * - Lease-based atomic claim prevents multiple workers from processing same message.
 * - Exponential backoff with jitter on transient failures.
 * - Dead-letters to CustomerOperationException after max retry attempts.
 * - Graceful shutdown handles SIGINT/SIGTERM without dropping active claims.
 *
 * Usage:
 *   node backend/scripts/workers/processTransactionalOutbox.js [--batchSize=10] [--leaseDurationMs=60000] [--loop] [--intervalMs=5000] [--dryRun]
 */

'use strict';

const mongoose = require('mongoose');
const transactionalNotificationService = require('../../services/notification/TransactionalNotificationService');
const logger = require('../../utils/logger');

let isProcessing = false;
let isShuttingDown = false;

async function processTransactionalOutbox({
  batchSize = 10,
  leaseDurationMs = 60000,
  dryRun = false,
  adapter = null
} = {}) {
  if (isShuttingDown) {
    logger.info('Outbox worker is shutting down; skipping process run');
    return { skipped: true, reason: 'SHUTTING_DOWN' };
  }

  if (isProcessing) {
    logger.warn('Transactional outbox processing already in progress; skipping overlapping run');
    return { skipped: true, reason: 'CONCURRENT_RUN' };
  }
  isProcessing = true;

  try {
    if (dryRun) {
      const candidates = await transactionalNotificationService.claimBatch({
        limit: batchSize,
        leaseDurationMs
      });
      logger.info('[DRY RUN] Claimed candidates count', { count: candidates.length });
      return {
        claimedCount: candidates.length,
        processedCount: 0,
        dryRun: true
      };
    }

    const result = await transactionalNotificationService.processOutbox({
      limit: batchSize,
      leaseDurationMs,
      adapter
    });

    logger.info('Transactional outbox batch processed', {
      claimedCount: result.claimedCount,
      processedCount: result.processedCount
    });

    return result;
  } catch (error) {
    logger.error('Transactional outbox worker error', { error: error?.message, stack: error?.stack });
    throw error;
  } finally {
    isProcessing = false;
  }
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {
    batchSize: 10,
    leaseDurationMs: 60000,
    dryRun: false,
    loop: false,
    intervalMs: 5000,
    maxIterations: Infinity
  };

  for (const arg of args) {
    if (arg === '--dryRun' || arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--loop') {
      options.loop = true;
    } else if (arg.startsWith('--batchSize=')) {
      options.batchSize = Math.max(1, parseInt(arg.split('=')[1], 10) || 10);
    } else if (arg.startsWith('--leaseDurationMs=')) {
      options.leaseDurationMs = Math.max(5000, parseInt(arg.split('=')[1], 10) || 60000);
    } else if (arg.startsWith('--intervalMs=')) {
      options.intervalMs = Math.max(500, parseInt(arg.split('=')[1], 10) || 5000);
    } else if (arg.startsWith('--maxIterations=')) {
      options.maxIterations = Math.max(1, parseInt(arg.split('=')[1], 10) || 1);
    }
  }

  return options;
}

async function runWorkerLoop(options) {
  let iteration = 0;

  const shutdownHandler = async (signal) => {
    logger.info(`Received ${signal}. Gracefully stopping outbox worker...`);
    isShuttingDown = true;
    // Wait for in-flight processing to complete
    let waitCount = 0;
    while (isProcessing && waitCount < 30) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      waitCount++;
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

  while (!isShuttingDown && iteration < options.maxIterations) {
    iteration++;
    try {
      await processTransactionalOutbox(options);
    } catch (err) {
      logger.error('Worker iteration failed', { iteration, error: err?.message });
    }

    if (!options.loop || iteration >= options.maxIterations) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
}

if (require.main === module) {
  const options = parseCliArgs();
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mevapur-commerce';

  mongoose.connect(mongoUri)
    .then(async () => {
      logger.info('Connected to MongoDB for transactional outbox worker', { options });
      await runWorkerLoop(options);
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Failed to run transactional outbox worker', { error: err?.message });
      process.exit(1);
    });
}

module.exports = {
  processTransactionalOutbox,
  parseCliArgs,
  runWorkerLoop
};

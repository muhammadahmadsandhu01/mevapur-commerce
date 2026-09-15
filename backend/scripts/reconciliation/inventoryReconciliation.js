#!/usr/bin/env node
'use strict';

/**
 * @file inventoryReconciliation.js
 * @description Read-only inventory reconciliation script for Phase 6D-2.
 * Compares InventoryPosition counters against active InventoryReservations and InventoryLedger totals.
 * Emits structured operational diagnostics without performing destructive modifications.
 */

const mongoose = require('mongoose');
const InventoryService = require('../../services/inventory/InventoryService');

async function runReconciliationReport(merchantScopeId = 'default') {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mevapur-commerce';
  const shouldDisconnect = mongoose.connection.readyState === 0;

  if (shouldDisconnect) {
    await mongoose.connect(mongoUri);
  }

  try {
    const report = await InventoryService.getReconciliationReport({ merchantScopeId });
    return report;
  } finally {
    if (shouldDisconnect) {
      await mongoose.disconnect();
    }
  }
}

module.exports = {
  runReconciliationReport
};

if (require.main === module) {
  const scope = process.argv[2] || 'default';
  runReconciliationReport(scope)
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.status === 'HEALTHY' ? 0 : 2);
    })
    .catch((err) => {
      console.error('Reconciliation report error:', err);
      process.exit(1);
    });
}

/**
 * @file phase8-migration.unit.test.js
 * @description Unit tests for Phase 8 Migration Script (dry-run, apply token, idempotency, index creation).
 */

'use strict';

const mongoose = require('mongoose');
const { runMigration, REQUIRED_APPLY_TOKEN } = require('../../scripts/migrations/phase8-notifications-invoices-exceptions');

const TransactionalMessage = require('../../models/TransactionalMessage');
const OrderDocument = require('../../models/OrderDocument');
const CustomerOperationException = require('../../models/CustomerOperationException');

describe('Phase 8 — Migration Dry-Run, Apply Token & Idempotency Unit Tests', () => {
  const resetIndexes = async () => {
    try { await TransactionalMessage.collection.dropIndexes(); } catch (_) {}
    try { await OrderDocument.collection.dropIndexes(); } catch (_) {}
    try { await CustomerOperationException.collection.dropIndexes(); } catch (_) {}
  };

  beforeEach(async () => {
    await resetIndexes();
  });

  it('5.1 executes dry-run by default without creating indexes or mutating state', async () => {
    const report = await runMigration({ apply: false });
    expect(report.mode).toBe('DRY_RUN');
    expect(report.indexesCreated).toBe(0);
    expect(report.totalPlannedIndexActions).toBeGreaterThan(0);
    expect(report.actionsReport.some((a) => a.status === 'PLANNED')).toBe(true);
  });

  it('5.2 rejects execution when apply is true but applyToken is missing or incorrect', async () => {
    await expect(runMigration({ apply: true })).rejects.toThrow(
      `Explicit valid apply token is required to execute migration. Pass --apply-token=${REQUIRED_APPLY_TOKEN}`
    );

    await expect(runMigration({ apply: true, applyToken: 'WRONG_TOKEN' })).rejects.toThrow(
      `Explicit valid apply token is required to execute migration. Pass --apply-token=${REQUIRED_APPLY_TOKEN}`
    );
  });

  it('5.3 successfully creates indexes when valid applyToken is provided', async () => {
    const report = await runMigration({
      apply: true,
      applyToken: REQUIRED_APPLY_TOKEN
    });

    expect(report.mode).toBe('APPLY');
    expect(report.indexesCreated).toBeGreaterThan(0);
    expect(report.actionsReport.some((a) => a.status === 'CREATED')).toBe(true);

    // Rerunning apply must be idempotent
    const rerun = await runMigration({
      apply: true,
      applyToken: REQUIRED_APPLY_TOKEN
    });

    expect(rerun.indexesCreated).toBe(0);
    expect(rerun.indexesSkipped).toBe(report.totalPlannedIndexActions);
    expect(rerun.actionsReport.every((a) => a.status === 'SKIPPED_ALREADY_EXISTS')).toBe(true);
  });
});

/**
 * @file phase7-migration.unit.test.js
 * @description Unit tests for Phase 7 migration script (dry-run, apply token, idempotency, index creation).
 */

'use strict';

const mongoose = require('mongoose');
const { runMigration, REQUIRED_APPLY_TOKEN } = require('../../scripts/migrations/phase7-returns-refunds-disputes');
const Order = require('../../models/Order');
const Return = require('../../models/Return');
const PaymentDispute = require('../../models/PaymentDispute');

describe('Phase 7 — Migration Dry-Run, Apply Token & Idempotency', () => {
  const dummyUserId = new mongoose.Types.ObjectId();

  it('runs dry-run mode by default and plans index creation without applying writes', async () => {
    const report = await runMigration({ apply: false });
    expect(report.mode).toBe('DRY_RUN');
    expect(report.totalPlannedIndexActions).toBeGreaterThan(0);
    expect(report.indexesCreated).toBe(0);
    expect(report.actionsReport.some((a) => a.status === 'PLANNED' || a.status === 'SKIPPED_ALREADY_EXISTS')).toBe(true);
  });

  it('fails if apply=true is passed without valid applyToken', async () => {
    await expect(runMigration({ apply: true, applyToken: 'WRONG_TOKEN' })).rejects.toThrow(
      'Explicit valid apply token is required'
    );
  });

  it('successfully executes migration when valid applyToken is provided', async () => {
    // Seed an order without returnPolicySnapshot
    await Order.create({
      orderId: `ORD-MIG-${Date.now()}`,
      user: dummyUserId,
      idempotencyKey: new mongoose.Types.ObjectId().toString(),
      requestHash: 'hash-mig-order',
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Migration Item',
        price: 1000,
        quantity: 1,
        lineTotal: 1000
      }],
      shippingAddress: {
        fullName: 'Mig Test',
        phone: '03001234567',
        address: '123 Mig Road',
        city: 'Lahore',
        country: 'PK'
      },
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      subtotal: 1000,
      totalAmount: 1000,
      statusTimeline: [{ status: 'Pending', actor: dummyUserId, actorRole: 'customer', timestamp: new Date() }]
    });

    const report = await runMigration({
      apply: true,
      applyToken: REQUIRED_APPLY_TOKEN
    });

    expect(report.mode).toBe('APPLY');
    expect(report.backfillStats.ordersUpdated).toBeGreaterThanOrEqual(1);

    // Running again is completely idempotent
    const rerun = await runMigration({
      apply: true,
      applyToken: REQUIRED_APPLY_TOKEN
    });
    expect(rerun.mode).toBe('APPLY');
    expect(rerun.indexesCreated).toBe(0); // All skipped because already exist
  });
});

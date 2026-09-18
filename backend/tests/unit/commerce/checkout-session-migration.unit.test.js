/**
 * @file checkout-session-migration.unit.test.js
 * @description Unit and mock migration tests for phase6d5-checkout-sessions-init.js.
 * Proves dry-run safety, explicit apply confirmation requirement, and index resilience on historical data.
 */

'use strict';

const mongoose = require('mongoose');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const { runMigration } = require('../../../scripts/migrations/phase6d5-checkout-sessions-init');

describe('Phase 6D-5A Index & Migration Unit Tests', () => {
  it('1. dry-run mode inspects target models without modifying indexes', async () => {
    const summary = await runMigration({
      apply: false,
      targetEnv: 'test',
      force: true
    });

    expect(summary.mode).toBe('DRY_RUN');
    expect(summary.indexCount).toBe(10);
    expect(summary.results.length).toBe(10);
    expect(summary.results.every((r) => r.action === 'DRY_RUN_WOULD_CREATE')).toBe(true);
  });

  it('2. apply requires explicit apply: true and target environment', async () => {
    await expect(runMigration({
      apply: true,
      targetEnv: null
    })).rejects.toThrow(/target environment/i);
  });

  it('3. historical Orders and Payments without checkout session fields build partial indexes cleanly', async () => {
    // Insert historical legacy order without session fields
    const historicalOrder = await Order.create({
      orderId: `ORD-LEGACY-${Date.now()}`,
      user: new mongoose.Types.ObjectId(),
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Legacy Product',
        price: 100,
        quantity: 1,
        lineTotal: 100
      }],
      subtotal: 100,
      totalAmount: 100,
      shippingAddress: {
        fullName: 'Legacy User',
        address: '123 Old St',
        city: 'Lahore',
        country: 'Pakistan',
        countryCode: 'PK',
        phone: '+923000000000'
      },
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      currency: 'PKR',
      checkoutSessionObjectId: null,
      checkoutSessionId: null,
      idempotencyKey: `legacy-order-${Date.now()}`,
      requestHash: `legacy-hash-${Date.now()}`,
      statusTimeline: [{
        status: 'Pending',
        actor: new mongoose.Types.ObjectId(),
        actorRole: 'customer',
        note: 'Legacy order placed'
      }]
    });

    expect(historicalOrder._id).toBeDefined();

    // Insert historical legacy payment without session fields
    const historicalPayment = await Payment.create({
      order: historicalOrder._id,
      user: historicalOrder.user,
      provider: 'cod',
      gateway: 'cod',
      status: 'Pending',
      amount: 100,
      currency: 'PKR',
      checkoutSessionObjectId: null,
      checkoutSessionId: null,
      idempotencyKey: `legacy-pay-${Date.now()}`,
      requestHash: `legacy-pay-hash-${Date.now()}`,
      providerIdempotencyKey: `legacy-prov-${Date.now()}`
    });

    expect(historicalPayment._id).toBeDefined();

    // Run migration with apply: true
    const summary = await runMigration({
      apply: true,
      targetEnv: 'test',
      force: true
    });

    expect(summary.mode).toBe('APPLIED');
    expect(summary.indexCount).toBe(10);
  });
});

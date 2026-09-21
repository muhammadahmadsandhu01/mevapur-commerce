/**
 * @file phase8-transactional-notifications.unit.test.js
 * @description Unit tests for Phase 8 Transactional Messaging Outbox, Idempotency,
 * Lease Concurrency, Bounded Retry Backoff, and Dead-Letter Exception Integration.
 */

'use strict';

const mongoose = require('mongoose');
const TransactionalMessage = require('../../models/TransactionalMessage');
const CustomerOperationException = require('../../models/CustomerOperationException');
const transactionalNotificationService = require('../../services/notification/TransactionalNotificationService');

describe('Phase 8 — Transactional Notifications & Outbox Unit Tests', () => {
  beforeEach(async () => {
    await TransactionalMessage.deleteMany({});
    await CustomerOperationException.deleteMany({});
    transactionalNotificationService.setTestAdapter(null);
  });

  it('1.1 queueNotification is idempotent: duplicate domain event produces one logical message', async () => {
    const payload = {
      orderNumber: 'ORD-9871',
      customerName: 'Ahmad Sandhu',
      total: '5500.00',
      currency: 'PKR',
      viewOrderUrl: 'https://storefront.mevapur.test/orders/ORD-9871'
    };

    const res1 = await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-9871',
      templateId: 'ORDER_CONFIRMATION_V1',
      recipient: { email: 'ahmad@example.com', name: 'Ahmad Sandhu' },
      payload
    });

    expect(res1.success).toBe(true);
    expect(res1.duplicate).toBe(false);

    // Second call with same payload
    const res2 = await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-9871',
      templateId: 'ORDER_CONFIRMATION_V1',
      recipient: { email: 'ahmad@example.com', name: 'Ahmad Sandhu' },
      payload
    });

    expect(res2.success).toBe(true);
    expect(res2.duplicate).toBe(true);
    expect(res2.messageId).toBe(res1.messageId);

    const count = await TransactionalMessage.countDocuments({ dedupKey: res1.dedupKey });
    expect(count).toBe(1);
  });

  it('1.2 claimBatch atomically claims due messages with bounded lease', async () => {
    await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-1001',
      templateId: 'ORDER_CONFIRMATION_V1',
      recipient: { email: 'user1@example.com', name: 'User One' },
      payload: { orderNumber: 'ORD-1001', customerName: 'User One', total: '100.00', currency: 'USD' }
    });

    await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-1002',
      templateId: 'ORDER_CONFIRMATION_V1',
      recipient: { email: 'user2@example.com', name: 'User Two' },
      payload: { orderNumber: 'ORD-1002', customerName: 'User Two', total: '200.00', currency: 'USD' }
    });

    const leaseId1 = 'worker-node-alpha';
    const claimed = await transactionalNotificationService.claimBatch({
      limit: 10,
      leaseDurationMs: 30000,
      leaseId: leaseId1
    });

    expect(claimed.length).toBe(2);
    expect(claimed[0].status).toBe('PROCESSING');

    // Concurrent worker with different lease ID cannot claim already leased messages
    const claimedWorker2 = await transactionalNotificationService.claimBatch({
      limit: 10,
      leaseDurationMs: 30000,
      leaseId: 'worker-node-beta'
    });

    expect(claimedWorker2.length).toBe(0);
  });

  it('1.3 successful delivery updates status to DELIVERED and records provider ID', async () => {
    const fakeAdapter = jest.fn().mockResolvedValue({
      messageId: 'BREVO-MSG-998877',
      provider: 'brevo',
      reason: 'ACCEPTED'
    });

    transactionalNotificationService.setTestAdapter(fakeAdapter);

    await transactionalNotificationService.queueNotification({
      domainType: 'payment',
      domainId: 'PAY-4401',
      templateId: 'PAYMENT_SUCCEEDED_V1',
      recipient: { email: 'paid@example.com', name: 'Paid Customer' },
      payload: { orderNumber: 'ORD-4401', customerName: 'Paid Customer', amount: '120.00', currency: 'USD' }
    });

    const batch = await transactionalNotificationService.processOutbox({ limit: 5 });
    expect(batch.claimedCount).toBe(1);
    expect(batch.processedCount).toBe(1);
    expect(batch.results[0].status).toBe('DELIVERED');
    expect(fakeAdapter).toHaveBeenCalledTimes(1);

    const doc = await TransactionalMessage.findOne({ domainId: 'PAY-4401' });
    expect(doc.status).toBe('DELIVERED');
    expect(doc.providerMessageId).toBe('BREVO-MSG-998877');
    expect(doc.deliveredAt).toBeTruthy();
  });

  it('1.4 retryable failure schedules retry with exponential backoff and increments attemptCount', async () => {
    const temporaryError = new Error('SMTP connection timeout');
    temporaryError.code = 'ETIMEDOUT';
    const fakeFailingAdapter = jest.fn().mockRejectedValue(temporaryError);
    transactionalNotificationService.setTestAdapter(fakeFailingAdapter);

    await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-5501',
      templateId: 'ORDER_CONFIRMATION_V1',
      recipient: { email: 'retry@example.com', name: 'Retry User' },
      payload: { orderNumber: 'ORD-5501', customerName: 'Retry User', total: '75.00', currency: 'USD' }
    });

    const batch = await transactionalNotificationService.processOutbox({ limit: 5 });
    expect(batch.results[0].status).toBe('FAILED');

    const doc = await TransactionalMessage.findOne({ domainId: 'ORD-5501' });
    expect(doc.status).toBe('FAILED');
    expect(doc.attemptCount).toBe(1);
    expect(doc.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('1.5 permanent failure or max attempts creates DEAD_LETTERED message and CustomerOperationException', async () => {
    const permanentError = new Error('Mailbox does not exist (550 5.1.1)');
    permanentError.isPermanent = true;
    permanentError.code = 'PERMANENT_DELIVERY_FAILURE';
    const fakePermanentFailure = jest.fn().mockRejectedValue(permanentError);
    transactionalNotificationService.setTestAdapter(fakePermanentFailure);

    await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-6601',
      templateId: 'ORDER_CONFIRMATION_V1',
      recipient: { email: 'invalid@nonexistent.domain', name: 'Ghost User' },
      payload: { orderNumber: 'ORD-6601', customerName: 'Ghost User', total: '99.00', currency: 'USD' }
    });

    const batch = await transactionalNotificationService.processOutbox({ limit: 5 });
    expect(batch.results[0].status).toBe('DEAD_LETTERED');

    const doc = await TransactionalMessage.findOne({ domainId: 'ORD-6601' });
    expect(doc.status).toBe('DEAD_LETTERED');
    expect(doc.deadLetteredAt).toBeTruthy();

    // Verify Exception Record created in CustomerOperationException
    const ex = await CustomerOperationException.findOne({ domainId: String(doc._id) });
    expect(ex).toBeTruthy();
    expect(ex.type).toBe('NOTIFICATION_DELIVERY_FAILED');
    expect(ex.status).toBe('OPEN');
  });

  it('1.6 expired lease allows safe reclaim by another worker node', async () => {
    await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-7701',
      templateId: 'ORDER_CONFIRMATION_V1',
      recipient: { email: 'expire@example.com', name: 'Expire User' },
      payload: { orderNumber: 'ORD-7701', customerName: 'Expire User', total: '50.00', currency: 'USD' }
    });

    // Worker A claims with 500ms lease
    const claimedA = await transactionalNotificationService.claimBatch({
      limit: 1,
      leaseDurationMs: 100,
      leaseId: 'worker-dead'
    });
    expect(claimedA.length).toBe(1);

    // Wait for lease to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Worker B claims expired lease
    const claimedB = await transactionalNotificationService.claimBatch({
      limit: 1,
      leaseDurationMs: 30000,
      leaseId: 'worker-live'
    });
    expect(claimedB.length).toBe(1);
    expect(claimedB[0].domainId).toBe('ORD-7701');
  });
});

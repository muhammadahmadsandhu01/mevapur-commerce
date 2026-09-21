/**
 * @file phase8-outbox-worker.integration.test.js
 * @description Integration tests for Transactional Outbox Worker lifecycle,
 * lease concurrency, retry backoff, dead-letter forwarding, and idempotency guarantees.
 */

'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');
const TransactionalMessage = require('../../models/TransactionalMessage');
const CustomerOperationException = require('../../models/CustomerOperationException');
const transactionalNotificationService = require('../../services/notification/TransactionalNotificationService');
const { processTransactionalOutbox } = require('../../scripts/workers/processTransactionalOutbox');

describe('Phase 8 — Outbox Worker Lifecycle & Delivery Guarantees Integration Tests', () => {
  beforeEach(async () => {
    await TransactionalMessage.deleteMany({});
    await CustomerOperationException.deleteMany({});
    transactionalNotificationService.setTestAdapter(null);
  });

  it('8.1 outbox worker processes pending messages successfully with adapter', async () => {
    await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-WORKER-001',
      channel: 'EMAIL',
      templateId: 'ORDER_CONFIRMATION',
      recipient: { email: 'worker-test@example.test', name: 'Worker Tester' },
      payload: { orderNumber: 'ORD-WORKER-001', customerName: 'Worker Tester', total: '100.00', currency: 'USD' }
    });

    const mockAdapter = jest.fn().mockResolvedValue({
      messageId: 'MSG-EXT-9999',
      provider: 'mock-smtp',
      reason: 'ACCEPTED'
    });

    const result = await processTransactionalOutbox({
      batchSize: 5,
      leaseDurationMs: 30000,
      adapter: mockAdapter
    });

    expect(result.claimedCount).toBe(1);
    expect(result.processedCount).toBe(1);
    expect(mockAdapter).toHaveBeenCalledTimes(1);

    const updated = await TransactionalMessage.findOne({ domainId: 'ORD-WORKER-001' });
    expect(updated.status).toBe('DELIVERED');
    expect(updated.providerMessageId).toBe('MSG-EXT-9999');
    expect(updated.deliveredAt).not.toBeNull();
  });

  it('8.2 two concurrent workers cannot claim the same active lease', async () => {
    await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-LEASE-001',
      channel: 'EMAIL',
      templateId: 'ORDER_CONFIRMATION',
      recipient: { email: 'lease@example.test', name: 'Lease Tester' },
      payload: { orderNumber: 'ORD-LEASE-001', customerName: 'Lease Tester', total: '50.00', currency: 'USD' }
    });

    const lease1 = crypto.randomUUID();
    const lease2 = crypto.randomUUID();

    const [claimed1, claimed2] = await Promise.all([
      transactionalNotificationService.claimBatch({ limit: 10, leaseDurationMs: 60000, leaseId: lease1 }),
      transactionalNotificationService.claimBatch({ limit: 10, leaseDurationMs: 60000, leaseId: lease2 })
    ]);

    const totalClaimed = claimed1.length + claimed2.length;
    expect(totalClaimed).toBe(1);

    const winner = claimed1.length === 1 ? claimed1[0] : claimed2[0];
    const winningLease = claimed1.length === 1 ? lease1 : lease2;
    expect(winner.leaseId).toBe(winningLease);
  });

  it('8.3 expired lease allows takeover by another worker', async () => {
    const pastTime = new Date(Date.now() - 120000);
    const expiredMsg = await TransactionalMessage.create({
      dedupKey: 'email:order_confirmation:order:ord-expired:test@example.test',
      domainType: 'order',
      domainId: 'ORD-EXPIRED',
      channel: 'EMAIL',
      templateId: 'ORDER_CONFIRMATION_V1',
      templateVersion: '1.0',
      recipient: { email: 'expired@example.test', name: 'Expired' },
      status: 'PROCESSING',
      leaseId: 'stale-lease-id',
      leaseAcquiredAt: new Date(Date.now() - 180000),
      leaseExpiresAt: pastTime,
      nextAttemptAt: pastTime
    });

    const newLeaseId = 'new-active-lease';
    const claimed = await transactionalNotificationService.claimBatch({
      limit: 10,
      leaseDurationMs: 60000,
      leaseId: newLeaseId,
      now: new Date()
    });

    expect(claimed.length).toBe(1);
    expect(claimed[0]._id.toString()).toBe(expiredMsg._id.toString());
    expect(claimed[0].leaseId).toBe(newLeaseId);
  });

  it('8.4 retryable failure schedules bounded exponential retry', async () => {
    const msg = await TransactionalMessage.create({
      dedupKey: 'email:order_confirmation:order:ord-retry:test@example.test',
      domainType: 'order',
      domainId: 'ORD-RETRY',
      channel: 'EMAIL',
      templateId: 'ORDER_CONFIRMATION_V1',
      templateVersion: '1.0',
      recipient: { email: 'retry@example.test', name: 'Retry' },
      status: 'PENDING',
      attemptCount: 0,
      maxAttempts: 5,
      nextAttemptAt: new Date()
    });

    const transientFailAdapter = jest.fn().mockRejectedValue({
      code: 'NETWORK_TIMEOUT',
      message: 'Connection timed out',
      isPermanent: false
    });

    const result = await transactionalNotificationService.deliverMessage(msg, {
      adapter: transientFailAdapter
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');

    const updated = await TransactionalMessage.findById(msg._id);
    expect(updated.status).toBe('FAILED');
    expect(updated.attemptCount).toBe(1);
    expect(updated.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('8.5 permanent failure or max attempts transitions to DEAD_LETTERED and records exception', async () => {
    const msg = await TransactionalMessage.create({
      dedupKey: 'email:order_confirmation:order:ord-dead:test@example.test',
      domainType: 'order',
      domainId: 'ORD-DEAD',
      channel: 'EMAIL',
      templateId: 'ORDER_CONFIRMATION_V1',
      templateVersion: '1.0',
      recipient: { email: 'dead@example.test', name: 'Dead' },
      status: 'PENDING',
      attemptCount: 4,
      maxAttempts: 5,
      nextAttemptAt: new Date()
    });

    const terminalFailAdapter = jest.fn().mockRejectedValue({
      code: 'PERMANENT_DELIVERY_FAILURE',
      message: 'Mailbox does not exist',
      isPermanent: true
    });

    const result = await transactionalNotificationService.deliverMessage(msg, {
      adapter: terminalFailAdapter
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('DEAD_LETTERED');

    const updated = await TransactionalMessage.findById(msg._id);
    expect(updated.status).toBe('DEAD_LETTERED');
    expect(updated.attemptCount).toBe(5);

    const exception = await CustomerOperationException.findOne({
      type: 'NOTIFICATION_DELIVERY_FAILED',
      domainId: String(msg._id)
    });
    expect(exception).not.toBeNull();
    expect(exception.safeDetails.attempts).toBe(5);
  });

  it('8.6 dry-run mode does not deliver or mutate messages', async () => {
    await transactionalNotificationService.queueNotification({
      domainType: 'order',
      domainId: 'ORD-DRYRUN-001',
      channel: 'EMAIL',
      templateId: 'ORDER_CONFIRMATION',
      recipient: { email: 'dryrun@example.test', name: 'Dry Run' },
      payload: { orderNumber: 'ORD-DRYRUN-001', customerName: 'Dry Run', total: '10.00', currency: 'USD' }
    });

    const mockAdapter = jest.fn();

    const result = await processTransactionalOutbox({
      batchSize: 10,
      dryRun: true,
      adapter: mockAdapter
    });

    expect(result.dryRun).toBe(true);
    expect(result.claimedCount).toBe(1);
    expect(result.processedCount).toBe(0);
    expect(mockAdapter).not.toHaveBeenCalled();
  });
});

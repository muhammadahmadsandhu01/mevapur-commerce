/**
 * @file phase8-exception-concurrency.integration.test.js
 * @description Concurrency, optimistic locking, and metrics tests for
 * CustomerOperationException and ExceptionQueueService.
 */

'use strict';

const mongoose = require('mongoose');
const CustomerOperationException = require('../../models/CustomerOperationException');
const exceptionQueueService = require('../../services/exception/ExceptionQueueService');

describe('Phase 8 — Exception Queue Concurrency & Metrics Integration Tests', () => {
  let admin1Id;
  let admin2Id;

  beforeEach(async () => {
    await CustomerOperationException.deleteMany({});
    admin1Id = new mongoose.Types.ObjectId();
    admin2Id = new mongoose.Types.ObjectId();
  });

  it('8.1 concurrent duplicate failures converge to a single active exception', async () => {
    const dedupKey = 'payment:payment:pay-conc-001:card_declined';

    await Promise.all([
      exceptionQueueService.recordException({
        type: 'PAYMENT_FAILED',
        domainType: 'payment',
        domainId: 'PAY-CONC-001',
        errorCode: 'CARD_DECLINED',
        sanitizedSummary: 'Card was declined',
        dedupKey
      }),
      exceptionQueueService.recordException({
        type: 'PAYMENT_FAILED',
        domainType: 'payment',
        domainId: 'PAY-CONC-001',
        errorCode: 'CARD_DECLINED',
        sanitizedSummary: 'Card was declined again',
        dedupKey
      }),
      exceptionQueueService.recordException({
        type: 'PAYMENT_FAILED',
        domainType: 'payment',
        domainId: 'PAY-CONC-001',
        errorCode: 'CARD_DECLINED',
        sanitizedSummary: 'Card was declined 3rd time',
        dedupKey
      })
    ]);

    const activeExceptions = await CustomerOperationException.find({ dedupKey });
    expect(activeExceptions.length).toBe(1);

    const active = activeExceptions[0];
    expect(active.attemptCount).toBeGreaterThanOrEqual(1);
  });

  it('8.2 optimistic locking prevents concurrent stale updates to the same exception', async () => {
    const created = await exceptionQueueService.recordException({
      type: 'SHIPMENT_DELAYED',
      domainType: 'shipment',
      domainId: 'SHIP-CONC-001',
      sanitizedSummary: 'Shipment delayed at carrier hub'
    });

    const doc = await CustomerOperationException.findById(created.id);
    const initialVersion = doc.version;

    // Admin 1 acknowledges
    const ack1 = await exceptionQueueService.acknowledgeException(created.id, admin1Id, {
      expectedVersion: initialVersion
    });
    expect(ack1.status).toBe('ACKNOWLEDGED');

    // Admin 2 tries to acknowledge with stale initialVersion -> rejected with 409
    await expect(
      exceptionQueueService.acknowledgeException(created.id, admin2Id, {
        expectedVersion: initialVersion
      })
    ).rejects.toMatchObject({
      code: 'OPTIMISTIC_LOCK_CONFLICT',
      statusCode: 409
    });
  });

  it('8.3 global metrics compute accurate filter-aware counts', async () => {
    await Promise.all([
      exceptionQueueService.recordException({
        type: 'PAYMENT_FAILED',
        domainType: 'payment',
        domainId: 'PAY-M-1',
        severity: 'HIGH',
        sanitizedSummary: 'Payment failed'
      }),
      exceptionQueueService.recordException({
        type: 'SHIPMENT_DELAYED',
        domainType: 'shipment',
        domainId: 'SHIP-M-2',
        severity: 'MEDIUM',
        sanitizedSummary: 'Shipment delayed'
      }),
      exceptionQueueService.recordException({
        type: 'REFUND_FAILED',
        domainType: 'refund',
        domainId: 'REF-M-3',
        severity: 'HIGH',
        sanitizedSummary: 'Refund failed'
      })
    ]);

    const metrics = await exceptionQueueService.computeMetrics();
    expect(metrics.totalOpen).toBe(3);
    expect(metrics.highSeverityCount).toBe(2);
    expect(metrics.byType.PAYMENT_FAILED).toBe(1);
    expect(metrics.byType.SHIPMENT_DELAYED).toBe(1);
    expect(metrics.byType.REFUND_FAILED).toBe(1);
  });

  it('8.4 CSV export neutralizes spreadsheet formula injection', async () => {
    await exceptionQueueService.recordException({
      type: 'PAYMENT_FAILED',
      domainType: 'payment',
      domainId: '=cmd|"/C calc"!A0',
      sanitizedSummary: '+@=Formula injection attempt',
      errorCode: '@SUM(A1:A10)'
    });

    const csvData = await exceptionQueueService.exportCsv();
    expect(typeof csvData).toBe('string');
    // Injection strings should be escaped with leading single quote or quotes
    expect(csvData).toContain("'+@=Formula injection attempt");
    expect(csvData).toContain("'@SUM(A1:A10)");
  });
});

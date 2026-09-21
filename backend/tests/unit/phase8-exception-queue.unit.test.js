/**
 * @file phase8-exception-queue.unit.test.js
 * @description Unit tests for Phase 8 Customer & Admin Exception Queues,
 * Dedup Convergence, Lifecycle State Machine, Global Metrics, and CSV Formula Escaping.
 */

'use strict';

const mongoose = require('mongoose');
const CustomerOperationException = require('../../models/CustomerOperationException');
const User = require('../../models/User');
const Order = require('../../models/Order');
const AuditLog = require('../../models/AuditLog');
const exceptionQueueService = require('../../services/exception/ExceptionQueueService');

describe('Phase 8 — Customer & Admin Exception Queue Unit Tests', () => {
  beforeEach(async () => {
    await CustomerOperationException.deleteMany({});
  });

  it('4.1 converges duplicate failures into one active exception record', async () => {
    const res1 = await exceptionQueueService.recordException({
      type: 'PAYMENT_FAILED',
      domainType: 'payment',
      domainId: 'PAY-112233',
      errorCode: 'INSUFFICIENT_FUNDS',
      sanitizedSummary: 'Payment failed due to insufficient funds',
      severity: 'HIGH',
      retryEligible: true
    });

    expect(res1.created).toBe(true);
    expect(res1.exceptionNumber).toMatch(/^EXP-\d{4}-/);

    // Second failure with same domain and error code
    const res2 = await exceptionQueueService.recordException({
      type: 'PAYMENT_FAILED',
      domainType: 'payment',
      domainId: 'PAY-112233',
      errorCode: 'INSUFFICIENT_FUNDS',
      sanitizedSummary: 'Payment failed second time',
      severity: 'HIGH',
      retryEligible: true
    });

    expect(res2.created).toBe(false);
    expect(res2.converged).toBe(true);
    expect(res2.exceptionNumber).toBe(res1.exceptionNumber);

    const count = await CustomerOperationException.countDocuments({ domainId: 'PAY-112233' });
    expect(count).toBe(1);

    const doc = await CustomerOperationException.findById(res1.id);
    expect(doc.attemptCount).toBe(1);
    expect(doc.version).toBe(2);
  });

  it('4.2 transitions lifecycle states and prevents illegal updates on resolved records', async () => {
    const adminUser = new mongoose.Types.ObjectId();
    const mockReq = {
      user: { id: adminUser },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Jest' },
      requestId: 'REQ-123'
    };

    const recorded = await exceptionQueueService.recordException({
      type: 'SHIPMENT_DELAYED',
      domainType: 'shipment',
      domainId: 'SHP-9001',
      sanitizedSummary: 'Carrier customs delay at hub',
      severity: 'MEDIUM'
    });

    // 1. Acknowledge
    const acked = await exceptionQueueService.acknowledgeException(recorded.id, adminUser, { req: mockReq });
    expect(acked.status).toBe('ACKNOWLEDGED');
    expect(acked.acknowledgedBy.toString()).toBe(adminUser.toString());

    // 2. Escalate
    const escalated = await exceptionQueueService.escalateException(recorded.id, {
      escalatedTo: 'Logistics Team Lead',
      reason: 'Package delayed over 72 hours'
    }, adminUser, { req: mockReq });
    expect(escalated.status).toBe('ESCALATED');
    expect(escalated.severity).toBe('CRITICAL');

    // 3. Resolve
    const resolved = await exceptionQueueService.resolveException(recorded.id, {
      resolutionReason: 'Carrier released package after customs inspection',
      resolutionCode: 'CUSTOMS_CLEARED'
    }, adminUser, { req: mockReq });
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionReason).toBe('Carrier released package after customs inspection');

    // 4. Attempting to acknowledge a resolved record throws error
    await expect(
      exceptionQueueService.acknowledgeException(recorded.id, adminUser)
    ).rejects.toThrow('Cannot acknowledge a resolved exception');
  });

  it('4.3 calculates server-side global metrics independently of page slicing', async () => {
    await exceptionQueueService.recordException({
      type: 'PAYMENT_FAILED',
      domainType: 'payment',
      domainId: 'PAY-1',
      sanitizedSummary: 'Failed 1',
      severity: 'HIGH'
    });

    const ex2 = await exceptionQueueService.recordException({
      type: 'WEBHOOK_DEAD_LETTERED',
      domainType: 'webhook',
      domainId: 'EVT-1',
      sanitizedSummary: 'Dead letter 1',
      severity: 'CRITICAL'
    });

    await exceptionQueueService.acknowledgeException(ex2.id, new mongoose.Types.ObjectId());

    const list = await exceptionQueueService.listExceptions({ page: 1, limit: 1 });
    expect(list.exceptions.length).toBe(1);
    expect(list.pagination.total).toBe(2);
    expect(list.metrics.openCount).toBe(1);
    expect(list.metrics.acknowledgedCount).toBe(1);
    expect(list.metrics.totalOpen).toBe(2);
  });

  it('4.4 escapes spreadsheet formula injection in CSV exports', async () => {
    await exceptionQueueService.recordException({
      type: 'PAYMENT_FAILED',
      domainType: 'payment',
      domainId: '=CMD|"/C calc"!A0',
      sanitizedSummary: '@SUM(1+1) formula injection attempt',
      errorCode: '+4412345678',
      severity: 'LOW'
    });

    const csv = await exceptionQueueService.exportCsv({});
    expect(csv).not.toContain('"=CMD');
    expect(csv).toContain("\"'=CMD|\"\"/C calc\"\"!A0\"");
    expect(csv).not.toContain('"@SUM');
    expect(csv).toContain("\"'@SUM(1+1) formula injection attempt\"");
    expect(csv).toContain("\"'+4412345678\"");
  });
});

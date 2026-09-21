/**
 * @file ExceptionQueueService.js
 * @description Centralized Customer & Admin Exception Queue Management Service for Phase 8.
 * Handles deduplicated exception convergence, lifecycle state transitions,
 * server-side global metrics, safe CSV export with formula escaping, and audit logging.
 */

'use strict';

const crypto = require('crypto');
const CustomerOperationException = require('../../models/CustomerOperationException');
const User = require('../../models/User');
const Order = require('../../models/Order');
const AuditService = require('../AuditService');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

const isDuplicateKey = (error) => error?.code === 11000;

const escapeCsvField = (field) => {
  if (field === null || field === undefined) return '""';
  let str = String(field);
  // Neutralize spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

class ExceptionQueueService {
  generateExceptionNumber(year = new Date().getFullYear()) {
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `EXP-${year}-${randomHex}`;
  }

  buildDedupKey({ type, domainType, domainId, errorCode = '' }) {
    return `${type}:${domainType}:${domainId}:${errorCode}`.toLowerCase();
  }

  async reportException(params) {
    return this.recordException(params);
  }

  async recordException({
    type,
    domainType,
    domainId,
    customerId = null,
    orderId = null,
    paymentId = null,
    shipmentId = null,
    returnId = null,
    refundId = null,
    webhookEventId = null,
    transactionalMessageId = null,
    severity = 'MEDIUM',
    errorCode = '',
    sanitizedSummary = null,
    rawErrorMessage = null,
    errorMessage = null,
    message = null,
    safeDetails = {},
    customerRecoveryGuidance = '',
    retryEligible = false,
    slaDueAt = null,
    dedupKey = null
  }) {
    const summary = String(sanitizedSummary || rawErrorMessage || errorMessage || message || errorCode || type || 'Operation exception').slice(0, 500);
    if (!type || !domainType || !domainId || !summary) {
      throw new AppError('type, domainType, domainId, and sanitizedSummary are required', 400, 'INVALID_EXCEPTION_INPUT');
    }

    const calculatedDedup = dedupKey || this.buildDedupKey({ type, domainType, domainId, errorCode });

    const activeFilter = {
      dedupKey: calculatedDedup,
      status: { $in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RETRY_SCHEDULED', 'ESCALATED'] }
    };

    const existingActive = await CustomerOperationException.findOne(activeFilter);
    if (existingActive) {
      existingActive.attemptCount = (existingActive.attemptCount || 0) + 1;
      existingActive.version = (existingActive.version || 1) + 1;
      existingActive.sanitizedSummary = summary;
      existingActive.safeDetails = safeDetails;
      existingActive.errorCode = errorCode;
      existingActive.updatedAt = new Date();
      await existingActive.save();
      return {
        created: false,
        converged: true,
        exceptionNumber: existingActive.exceptionNumber,
        status: existingActive.status,
        id: String(existingActive._id)
      };
    }

    try {
      const exceptionNumber = this.generateExceptionNumber();
      const exception = await CustomerOperationException.create({
        exceptionNumber,
        dedupKey: calculatedDedup,
        type,
        domainType,
        domainId: String(domainId),
        customer: customerId,
        order: orderId,
        payment: paymentId,
        shipment: shipmentId,
        returnRequest: returnId,
        refund: refundId,
        webhookEvent: webhookEventId,
        transactionalMessage: transactionalMessageId,
        severity,
        status: 'OPEN',
        errorCode,
        sanitizedSummary: summary,
        safeDetails,
        customerRecoveryGuidance: customerRecoveryGuidance.slice(0, 500),
        retryEligible: Boolean(retryEligible),
        attemptCount: 0,
        maxAttempts: 3,
        slaDueAt: slaDueAt || new Date(Date.now() + 24 * 60 * 60 * 1000) // Default 24h SLA
      });

      return {
        created: true,
        exceptionNumber: exception.exceptionNumber,
        status: exception.status,
        id: String(exception._id)
      };
    } catch (err) {
      if (isDuplicateKey(err)) {
        // Converge on existing open exception
        const existing = await CustomerOperationException.findOneAndUpdate(
          {
            dedupKey: calculatedDedup,
            status: { $in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RETRY_SCHEDULED', 'ESCALATED'] }
          },
          {
            $inc: { attemptCount: 1, version: 1 },
            $set: {
              sanitizedSummary: summary,
              safeDetails,
              errorCode,
              updatedAt: new Date()
            }
          },
          { new: true }
        );

        if (existing) {
          return {
            created: false,
            converged: true,
            exceptionNumber: existing.exceptionNumber,
            status: existing.status,
            id: String(existing._id)
          };
        }
      }
      throw err;
    }
  }

  async listExceptions(query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.severity) filter.severity = query.severity;
    if (query.assignedTo) filter.assignedTo = query.assignedTo;
    if (query.customer) filter.customer = query.customer;
    if (query.order) filter.order = query.order;

    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      filter.$or = [
        { exceptionNumber: searchRegex },
        { sanitizedSummary: searchRegex },
        { errorCode: searchRegex },
        { domainId: searchRegex }
      ];
    }

    // Global Metrics
    const [
      totalFiltered,
      openCount,
      acknowledgedCount,
      inProgressCount,
      criticalCount,
      escalatedCount,
      items
    ] = await Promise.all([
      CustomerOperationException.countDocuments(filter),
      CustomerOperationException.countDocuments({ status: 'OPEN' }),
      CustomerOperationException.countDocuments({ status: 'ACKNOWLEDGED' }),
      CustomerOperationException.countDocuments({ status: 'IN_PROGRESS' }),
      CustomerOperationException.countDocuments({ severity: 'CRITICAL', status: { $ne: 'RESOLVED' } }),
      CustomerOperationException.countDocuments({ status: 'ESCALATED' }),
      CustomerOperationException.find(filter)
        .populate('customer', 'fullName email')
        .populate('order', 'orderId totalAmount paymentMethod')
        .populate('assignedTo', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    const pages = Math.ceil(totalFiltered / limit) || 1;

    return {
      exceptions: items,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1
      },
      metrics: {
        openCount,
        acknowledgedCount,
        inProgressCount,
        criticalCount,
        escalatedCount,
        totalOpen: openCount + acknowledgedCount + inProgressCount + escalatedCount
      }
    };
  }

  async computeMetrics(filter = {}) {
    const [
      openCount,
      acknowledgedCount,
      inProgressCount,
      criticalCount,
      highSeverityCount,
      escalatedCount,
      byTypeAgg
    ] = await Promise.all([
      CustomerOperationException.countDocuments({ ...filter, status: 'OPEN' }),
      CustomerOperationException.countDocuments({ ...filter, status: 'ACKNOWLEDGED' }),
      CustomerOperationException.countDocuments({ ...filter, status: 'IN_PROGRESS' }),
      CustomerOperationException.countDocuments({ ...filter, severity: 'CRITICAL', status: { $ne: 'RESOLVED' } }),
      CustomerOperationException.countDocuments({ ...filter, severity: 'HIGH', status: { $ne: 'RESOLVED' } }),
      CustomerOperationException.countDocuments({ ...filter, status: 'ESCALATED' }),
      CustomerOperationException.aggregate([
        { $match: { ...filter, status: { $ne: 'RESOLVED' } } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    const byType = {};
    for (const item of byTypeAgg) {
      byType[item._id] = item.count;
    }

    return {
      openCount,
      acknowledgedCount,
      inProgressCount,
      criticalCount,
      highSeverityCount,
      escalatedCount,
      totalOpen: openCount + acknowledgedCount + inProgressCount + escalatedCount,
      byType
    };
  }

  async getMetrics(filter = {}) {
    return this.computeMetrics(filter);
  }

  async getExceptionById(id) {
    const exception = await CustomerOperationException.findById(id)
      .populate('customer', 'fullName email phone')
      .populate('order')
      .populate('payment')
      .populate('assignedTo', 'fullName email')
      .populate('acknowledgedBy', 'fullName email')
      .populate('resolvedBy', 'fullName email')
      .populate('transactionalMessage');

    if (!exception) {
      throw new AppError('Exception not found', 404, ERROR_CODES.EXCEPTION_NOT_FOUND || 'EXCEPTION_NOT_FOUND');
    }

    return exception;
  }

  async acknowledgeException(id, userId, { expectedVersion = null, req = null } = {}) {
    const exception = await CustomerOperationException.findById(id);
    if (!exception) {
      throw new AppError('Exception not found', 404, 'EXCEPTION_NOT_FOUND');
    }

    if (expectedVersion !== null && expectedVersion !== undefined && exception.version !== expectedVersion) {
      throw new AppError('Exception has been modified by another admin', 409, 'OPTIMISTIC_LOCK_CONFLICT');
    }

    if (exception.status === 'RESOLVED') {
      throw new AppError('Cannot acknowledge a resolved exception', 409, 'INVALID_EXCEPTION_TRANSITION');
    }

    exception.status = 'ACKNOWLEDGED';
    exception.acknowledgedBy = userId;
    exception.acknowledgedAt = new Date();
    exception.version = (exception.version || 1) + 1;
    await exception.save();

    if (req) {
      await AuditService.log({
        req,
        eventName: 'EXCEPTION.ACKNOWLEDGED',
        status: 'SUCCESS',
        metadata: { exceptionNumber: exception.exceptionNumber, type: exception.type }
      });
    }

    return exception;
  }

  async assignException(id, assignToUserId, userId, { req = null } = {}) {
    const exception = await CustomerOperationException.findById(id);
    if (!exception) {
      throw new AppError('Exception not found', 404, 'EXCEPTION_NOT_FOUND');
    }

    exception.assignedTo = assignToUserId;
    exception.assignedAt = new Date();
    if (exception.status === 'OPEN') {
      exception.status = 'IN_PROGRESS';
    }
    exception.version = (exception.version || 1) + 1;
    await exception.save();

    if (req) {
      await AuditService.log({
        req,
        eventName: 'EXCEPTION.ASSIGNED',
        status: 'SUCCESS',
        metadata: { exceptionNumber: exception.exceptionNumber, assignedTo: assignToUserId }
      });
    }

    return exception;
  }

  async escalateException(id, { escalatedTo = 'Leadership', reason = '' }, userId, { req = null } = {}) {
    const exception = await CustomerOperationException.findById(id);
    if (!exception) {
      throw new AppError('Exception not found', 404, 'EXCEPTION_NOT_FOUND');
    }

    exception.status = 'ESCALATED';
    exception.severity = 'CRITICAL';
    exception.escalatedTo = escalatedTo;
    exception.escalatedAt = new Date();
    exception.safeDetails = {
      ...(exception.safeDetails || {}),
      escalationReason: reason
    };
    exception.version = (exception.version || 1) + 1;
    await exception.save();

    if (req) {
      await AuditService.log({
        req,
        eventName: 'EXCEPTION.ESCALATED',
        status: 'SUCCESS',
        metadata: { exceptionNumber: exception.exceptionNumber, escalatedTo, reason }
      });
    }

    return exception;
  }

  async resolveException(id, { resolutionReason, resolutionCode = 'RESOLVED_MANUAL' }, userId, { req = null } = {}) {
    if (!resolutionReason || typeof resolutionReason !== 'string' || resolutionReason.trim().length === 0) {
      throw new AppError('Resolution reason is required', 400, 'RESOLUTION_REASON_REQUIRED');
    }

    const exception = await CustomerOperationException.findById(id);
    if (!exception) {
      throw new AppError('Exception not found', 404, 'EXCEPTION_NOT_FOUND');
    }

    exception.status = 'RESOLVED';
    exception.resolvedBy = userId;
    exception.resolvedAt = new Date();
    exception.resolutionReason = resolutionReason.trim().slice(0, 1000);
    exception.resolutionCode = resolutionCode.slice(0, 64);
    exception.version = (exception.version || 1) + 1;
    await exception.save();

    if (req) {
      await AuditService.log({
        req,
        eventName: 'EXCEPTION.RESOLVED',
        status: 'SUCCESS',
        metadata: { exceptionNumber: exception.exceptionNumber, resolutionCode }
      });
    }

    return exception;
  }

  async retryException(id, userId, { req = null } = {}) {
    const exception = await CustomerOperationException.findById(id);
    if (!exception) {
      throw new AppError('Exception not found', 404, 'EXCEPTION_NOT_FOUND');
    }

    if (!exception.retryEligible) {
      throw new AppError('This exception is not marked eligible for automated retry', 400, 'EXCEPTION_NOT_RETRYABLE');
    }

    exception.attemptCount = (exception.attemptCount || 0) + 1;
    exception.lastRetriedAt = new Date();
    exception.status = 'RETRY_SCHEDULED';
    exception.version = (exception.version || 1) + 1;
    await exception.save();

    // Trigger underlying domain retry if applicable
    let retryResult = { triggered: true };
    if (exception.domainType === 'notification' && exception.transactionalMessage) {
      try {
        const transactionalNotificationService = require('../notification/TransactionalNotificationService');
        const msg = await require('../../models/TransactionalMessage').findById(exception.transactionalMessage);
        if (msg) {
          retryResult = await transactionalNotificationService.deliverMessage(msg);
          if (retryResult.status === 'DELIVERED') {
            exception.status = 'RESOLVED';
            exception.resolvedAt = new Date();
            exception.resolutionReason = 'Resolved via automated notification retry';
            exception.resolutionCode = 'AUTO_RETRY_SUCCESS';
            await exception.save();
          }
        }
      } catch (_err) {
        retryResult = { triggered: false, error: _err.message };
      }
    }

    if (req) {
      await AuditService.log({
        req,
        eventName: 'EXCEPTION.RETRY_TRIGGERED',
        status: 'SUCCESS',
        metadata: { exceptionNumber: exception.exceptionNumber, attemptCount: exception.attemptCount }
      });
    }

    return {
      exception,
      retryResult
    };
  }

  async exportCsv(query = {}) {
    const filter = {};
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.severity) filter.severity = query.severity;

    const items = await CustomerOperationException.find(filter)
      .populate('customer', 'fullName email')
      .populate('order', 'orderId totalAmount')
      .sort({ createdAt: -1 })
      .limit(1000);

    const headers = [
      'Exception Number',
      'Type',
      'Severity',
      'Status',
      'Domain Type',
      'Domain ID',
      'Customer Email',
      'Order Ref',
      'Summary',
      'Error Code',
      'Created At',
      'SLA Due At'
    ];

    const rows = items.map((ex) => [
      escapeCsvField(ex.exceptionNumber),
      escapeCsvField(ex.type),
      escapeCsvField(ex.severity),
      escapeCsvField(ex.status),
      escapeCsvField(ex.domainType),
      escapeCsvField(ex.domainId),
      escapeCsvField(ex.customer?.email || ''),
      escapeCsvField(ex.order?.orderId || ''),
      escapeCsvField(ex.sanitizedSummary),
      escapeCsvField(ex.errorCode),
      escapeCsvField(ex.createdAt ? new Date(ex.createdAt).toISOString() : ''),
      escapeCsvField(ex.slaDueAt ? new Date(ex.slaDueAt).toISOString() : '')
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}

module.exports = new ExceptionQueueService();

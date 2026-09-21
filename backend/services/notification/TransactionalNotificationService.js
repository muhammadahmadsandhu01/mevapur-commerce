/**
 * @file TransactionalNotificationService.js
 * @description Authoritative Outbox & Transactional Notification Delivery Service for Phase 8.
 * Handles idempotent message generation, lease-based batch processing,
 * bounded exponential backoff, dead-letter exception creation, and adapter dispatch.
 */

'use strict';

const crypto = require('crypto');
const TransactionalMessage = require('../../models/TransactionalMessage');
const messageTemplateEngine = require('./MessageTemplateEngine');
const EmailService = require('../EmailService');
const logger = require('../../utils/logger');
const { AppError } = require('../../common/errors/AppError');

const isDuplicateKey = (error) => error?.code === 11000;

class TransactionalNotificationService {
  constructor() {
    this.testAdapter = null;
  }

  setTestAdapter(adapter) {
    this.testAdapter = adapter;
  }

  calculateRetryDelay(attemptCount) {
    const baseDelayMs = 1000 * Math.pow(2, Math.min(attemptCount, 10)); // 2s, 4s, 8s, 16s...
    const jitter = (attemptCount * 79) % 250;
    return Math.min(baseDelayMs + jitter, 1800000); // Capped at 30 minutes
  }

  buildDedupKey({ channel = 'EMAIL', templateId, domainType, domainId, recipient = {} }) {
    const recipientRef = recipient.email || recipient.phone || recipient.userId || 'general';
    return `${channel}:${templateId}:${domainType}:${domainId}:${recipientRef}`.toLowerCase();
  }

  async queueNotification({
    domainType,
    domainId,
    channel = 'EMAIL',
    templateId,
    templateVersion = '1.0',
    recipient = {},
    payload = {},
    priority = 'MEDIUM',
    locale = 'en-US',
    dedupKey = null
  }) {
    if (!domainType || !domainId || !templateId) {
      throw new AppError('domainType, domainId, and templateId are required', 400, 'INVALID_NOTIFICATION_INPUT');
    }

    const calculatedDedup = dedupKey || this.buildDedupKey({
      channel,
      templateId,
      domainType,
      domainId,
      recipient
    });

    // Render template to validate variables upfront
    const rendered = messageTemplateEngine.render(templateId, payload, { locale, version: templateVersion });

    const existing = await TransactionalMessage.findOne({ dedupKey: calculatedDedup });
    if (existing) {
      return {
        success: true,
        messageId: String(existing._id),
        dedupKey: existing.dedupKey,
        status: existing.status,
        duplicate: true
      };
    }

    try {
      const message = await TransactionalMessage.create({
        dedupKey: calculatedDedup,
        domainType,
        domainId: String(domainId),
        channel,
        templateId,
        templateVersion: rendered.templateVersion,
        recipient: {
          userId: recipient.userId || null,
          email: (recipient.email || '').toLowerCase().trim(),
          phone: recipient.phone || '',
          name: recipient.name || ''
        },
        locale: rendered.locale,
        status: 'PENDING',
        priority,
        payload,
        renderedSubject: rendered.subject,
        renderedBody: rendered.html,
        renderedText: rendered.text,
        attemptCount: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date()
      });

      return {
        success: true,
        messageId: String(message._id),
        dedupKey: message.dedupKey,
        status: message.status,
        duplicate: false
      };
    } catch (err) {
      if (isDuplicateKey(err)) {
        const existing = await TransactionalMessage.findOne({ dedupKey: calculatedDedup });
        if (existing) {
          return {
            success: true,
            messageId: String(existing._id),
            dedupKey: existing.dedupKey,
            status: existing.status,
            duplicate: true
          };
        }
      }
      throw err;
    }
  }

  async claimBatch({ limit = 10, leaseDurationMs = 60000, now = new Date(), leaseId = null } = {}) {
    const activeLeaseId = leaseId || crypto.randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const candidates = await TransactionalMessage.find({
      $or: [
        { status: 'PENDING', nextAttemptAt: { $lte: now } },
        { status: 'FAILED', nextAttemptAt: { $lte: now } },
        { status: 'PROCESSING', leaseExpiresAt: { $lt: now } }
      ]
    })
      .sort({ priority: -1, createdAt: 1 })
      .limit(limit);

    const claimed = [];
    for (const candidate of candidates) {
      const updated = await TransactionalMessage.findOneAndUpdate(
        {
          _id: candidate._id,
          $or: [
            { status: 'PENDING' },
            { status: 'FAILED' },
            { status: 'PROCESSING', leaseExpiresAt: { $lt: now } }
          ]
        },
        {
          $set: {
            status: 'PROCESSING',
            leaseId: activeLeaseId,
            leaseAcquiredAt: now,
            leaseExpiresAt
          }
        },
        { new: true }
      );

      if (updated) {
        claimed.push(updated);
      }
    }

    return claimed;
  }

  async deliverMessage(message, { adapter = null } = {}) {
    const activeAdapter = adapter || this.testAdapter || this.defaultAdapter.bind(this);
    const now = new Date();

    try {
      const result = await activeAdapter(message);

      message.status = 'DELIVERED';
      message.providerMessageId = result?.messageId || `MSG-${crypto.randomUUID()}`;
      message.providerStatus = result?.reason || 'DELIVERED';
      message.provider = result?.provider || 'internal';
      message.deliveredAt = now;
      message.leaseExpiresAt = null;
      await message.save();

      return {
        success: true,
        status: 'DELIVERED',
        messageId: String(message._id),
        providerMessageId: message.providerMessageId
      };
    } catch (err) {
      const isPermanent = err?.isPermanent || err?.statusCode === 400 || err?.code === 'PERMANENT_DELIVERY_FAILURE';
      const newAttemptCount = (message.attemptCount || 0) + 1;
      const reachedMax = newAttemptCount >= (message.maxAttempts || 5);

      if (isPermanent || reachedMax) {
        message.status = 'DEAD_LETTERED';
        message.attemptCount = newAttemptCount;
        message.deadLetteredAt = now;
        message.leaseExpiresAt = null;
        message.lastErrorCode = err?.code || 'DELIVERY_TERMINAL_FAILURE';
        message.lastErrorMessage = (err?.message || 'Terminal notification delivery failure').slice(0, 500);
        await message.save();

        // Forward to exception queue if registered
        try {
          const exceptionQueueService = require('../exception/ExceptionQueueService');
          await exceptionQueueService.recordException({
            type: 'NOTIFICATION_DELIVERY_FAILED',
            domainType: 'notification',
            domainId: String(message._id),
            customerId: message.recipient?.userId || null,
            severity: 'MEDIUM',
            errorCode: message.lastErrorCode,
            sanitizedSummary: `Notification delivery permanently failed for template ${message.templateId} to ${message.recipient?.email || message.recipient?.phone || 'recipient'}`,
            safeDetails: {
              channel: message.channel,
              templateId: message.templateId,
              domainType: message.domainType,
              domainId: message.domainId,
              attempts: newAttemptCount
            },
            retryEligible: true
          });
        } catch (_exErr) {
          logger.warn('Failed to record notification delivery exception', { error: _exErr?.message });
        }

        return {
          success: false,
          status: 'DEAD_LETTERED',
          messageId: String(message._id),
          errorCode: message.lastErrorCode
        };
      } else {
        const delayMs = this.calculateRetryDelay(newAttemptCount);
        message.status = 'FAILED';
        message.attemptCount = newAttemptCount;
        message.nextAttemptAt = new Date(now.getTime() + delayMs);
        message.leaseExpiresAt = null;
        message.lastErrorCode = err?.code || 'DELIVERY_TEMPORARY_FAILURE';
        message.lastErrorMessage = (err?.message || 'Temporary notification delivery failure').slice(0, 500);
        await message.save();

        return {
          success: false,
          status: 'FAILED',
          messageId: String(message._id),
          retryScheduledAt: message.nextAttemptAt
        };
      }
    }
  }

  async defaultAdapter(message) {
    if (message.channel === 'EMAIL') {
      const emailData = {
        to: message.recipient.email,
        toName: message.recipient.name,
        subject: message.renderedSubject,
        html: message.renderedBody,
        text: message.renderedText
      };
      return await EmailService.send(emailData);
    }
    // For SMS/IN_APP/WHATSAPP default mock acceptance
    return {
      success: true,
      messageId: `MOCK-${crypto.randomUUID()}`,
      provider: 'mock',
      reason: 'ACCEPTED'
    };
  }

  async processOutbox({ limit = 10, leaseDurationMs = 60000, adapter = null } = {}) {
    const claimed = await this.claimBatch({ limit, leaseDurationMs });
    const results = [];

    for (const msg of claimed) {
      const res = await this.deliverMessage(msg, { adapter });
      results.push(res);
    }

    return {
      claimedCount: claimed.length,
      processedCount: results.length,
      results
    };
  }
}

module.exports = new TransactionalNotificationService();

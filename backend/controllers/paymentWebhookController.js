/**
 * @file paymentWebhookController.js
 * @description HTTP Controller for Payment Webhook Ingress and Admin Health Inspection.
 */

'use strict';

const paymentWebhookInboxService = require('../services/payment/webhooks/PaymentWebhookInboxService');
const paymentWebhookProcessor = require('../services/payment/webhooks/PaymentWebhookProcessor');
const { AppError } = require('../common/errors/AppError');

exports.handleWebhook = async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      throw new AppError(
        'Webhook body must be provided as raw bytes',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    const signature = req.headers['stripe-signature']
      || req.headers['x-payment-signature']
      || req.headers['x-webhook-signature'];

    const result = await paymentWebhookInboxService.recordWebhook({
      provider: req.params.provider,
      rawBody: req.body,
      signature,
      headers: req.headers,
      requestId: req.requestId
    });

    return res.status(200).json({
      success: true,
      data: {
        received: true,
        duplicate: result.duplicate,
        outcome: result.status,
        eventId: result.eventId
      },
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getWebhookHealth = async (req, res, next) => {
  try {
    const health = await paymentWebhookProcessor.getHealthStats();

    return res.status(200).json({
      success: true,
      data: health,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

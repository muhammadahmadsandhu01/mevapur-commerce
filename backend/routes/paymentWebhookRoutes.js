/**
 * @file paymentWebhookRoutes.js
 * @description Ingress and Admin Health routes for Payment Webhooks.
 */

'use strict';

const express = require('express');
const paymentWebhookController = require('../controllers/paymentWebhookController');
const validate = require('../middleware/validate');
const { protect, admin } = require('../middleware/auth');
const { webhookProviderSchema } = require('../validators/paymentValidator');

const webhookIngressRouter = express.Router();
const webhookAdminRouter = express.Router();

webhookIngressRouter.post(
  '/:provider',
  express.raw({ type: 'application/json', limit: '256kb' }),
  validate(webhookProviderSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentWebhookController.handleWebhook
);

webhookAdminRouter.get(
  '/health',
  protect,
  admin,
  paymentWebhookController.getWebhookHealth
);

module.exports = {
  webhookIngressRouter,
  webhookAdminRouter
};

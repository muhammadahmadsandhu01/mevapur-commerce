const express = require('express');
const paymentController = require('../controllers/paymentController');
const { protect, admin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  createPaymentSchema,
  createRefundSchema,
  codCollectionSchema,
  idempotencyHeaderSchema,
  manualPaymentReviewSchema,
  manualPaymentSubmissionSchema,
  orderPaymentReferenceSchema,
  paymentAvailabilityQuerySchema,
  paymentListQuerySchema,
  paymentReferenceSchema,
  webhookProviderSchema
} = require('../validators/paymentValidator');

const router = express.Router();
const webhookRouter = express.Router();

webhookRouter.post(
  '/:provider',
  express.raw({ type: 'application/json', limit: '1mb' }),
  validate(webhookProviderSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.handleWebhook
);

router.get(
  '/methods',
  validate(paymentAvailabilityQuerySchema, {
    source: 'query',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.getAvailableMethods
);

router.get(
  '/providers/status',
  protect,
  admin,
  validate(paymentAvailabilityQuerySchema, {
    source: 'query',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.getProviderStatuses
);

router.post(
  '/',
  protect,
  validate(idempotencyHeaderSchema, {
    source: 'headers',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  validate(createPaymentSchema, {
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.createPayment
);

router.get(
  '/order/:orderId',
  protect,
  validate(orderPaymentReferenceSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.getPaymentForOrder
);

router.post(
  '/:id/manual-submission',
  protect,
  validate(paymentReferenceSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  validate(manualPaymentSubmissionSchema, {
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.submitManualPayment
);

router.post(
  '/:id/manual-review',
  protect,
  admin,
  validate(paymentReferenceSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  validate(manualPaymentReviewSchema, {
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.reviewManualPayment
);

router.post(
  '/:id/collect',
  protect,
  admin,
  validate(paymentReferenceSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  validate(codCollectionSchema, {
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.collectCodPayment
);

router.get(
  '/',
  protect,
  admin,
  validate(paymentListQuerySchema, {
    source: 'query',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.listPayments
);

router.get(
  '/:id',
  protect,
  validate(paymentReferenceSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.getPayment
);

router.post(
  '/:id/refunds',
  protect,
  admin,
  validate(idempotencyHeaderSchema, {
    source: 'headers',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  validate(paymentReferenceSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  validate(createRefundSchema, {
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  paymentController.createRefund
);

module.exports = router;
module.exports.webhookRouter = webhookRouter;

const express = require('express');
const { protect, admin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  refundListQuerySchema,
  refundReferenceSchema
} = require('../validators/paymentValidator');
const {
  getRefunds,
  getRefund,
  getRefundStats
} = require('../controllers/refundController');

const router = express.Router();

router.use(protect, admin);
router.get('/stats', getRefundStats);
router.get(
  '/',
  validate(refundListQuerySchema, {
    source: 'query',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  getRefunds
);
router.get(
  '/:id',
  validate(refundReferenceSchema, {
    source: 'params',
    code: 'PAYMENT_VALIDATION_FAILED'
  }),
  getRefund
);

module.exports = router;

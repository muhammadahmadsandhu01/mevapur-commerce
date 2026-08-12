const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const schemas = require('../validators/customerCommerceValidator');
const {
  getReturns,
  getReturn,
  createReturn,
  updateReturnStatus,
  processRefund,
  getReturnStats
} = require('../controllers/returnController');

router.use(protect, admin);
const checked = (schema, source = 'body') => validate(schema, { source });

router.get('/stats', getReturnStats);
router.get('/', getReturns);
router.get('/:id', getReturn);
router.post('/', checked(schemas.returnRequestSchema), createReturn);
router.put('/:id/status', checked(schemas.idParam, 'params'), checked(schemas.returnStatusUpdateSchema), updateReturnStatus);
router.post('/:id/refund', checked(schemas.idParam, 'params'), checked(schemas.returnRefundSchema), processRefund);

module.exports = router;

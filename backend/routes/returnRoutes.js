const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getReturns,
  getReturn,
  createReturn,
  updateReturnStatus,
  processRefund,
  getReturnStats
} = require('../controllers/returnController');

router.use(protect, admin);

router.get('/stats', getReturnStats);
router.get('/', getReturns);
router.get('/:id', getReturn);
router.post('/', createReturn);
router.put('/:id/status', updateReturnStatus);
router.post('/:id/refund', processRefund);

module.exports = router;
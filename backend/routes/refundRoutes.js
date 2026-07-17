const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getRefunds,
  getRefund,
  createRefund,
  updateRefundStatus,
  getRefundStats
} = require('../controllers/refundController');

// All routes require authentication and admin role
router.use(protect, admin);

router.get('/stats', getRefundStats);
router.get('/', getRefunds);
router.get('/:id', getRefund);
router.post('/', createRefund);
router.put('/:id', updateRefundStatus);

module.exports = router;
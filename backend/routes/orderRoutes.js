const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getOrders,
  getOrder,
  updateOrderStatus,
  getRecentOrders,
  getOrderStats
} = require('../controllers/orderController');

// All routes are protected (admin only)
router.use(protect, admin);

router.get('/', getOrders);
router.get('/recent', getRecentOrders);
router.get('/stats', getOrderStats);
router.get('/:id', getOrder);
router.put('/:id/status', updateOrderStatus);

module.exports = router;
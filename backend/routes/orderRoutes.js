const express = require('express');
const router = express.Router();
const { 
  createOrder, 
  getOrders, 
  getOrderById, 
  getMyOrders, 
  updateOrderStatus,
  getRecentOrders,    // 🌟 ADDED
  getOrderStats       // 🌟 ADDED
} = require('../controllers/orderController');

const { protect, admin } = require('../middleware/auth');

// Admin: view all orders with pagination & filters
router.get('/', protect, admin, getOrders);

// Admin: view recent orders (for dashboard)
router.get('/recent', protect, admin, getRecentOrders);

// Admin: view order statistics (for dashboard)
router.get('/stats', protect, admin, getOrderStats);

// Customer: view own order history
router.get('/my-orders', protect, getMyOrders);

// View a single order — owner or admin only (checked in controller)
router.get('/:id', protect, getOrderById);

// Customer: place a new order
router.post('/', protect, createOrder);

// Admin: update order status
router.put('/:id/status', protect, admin, updateOrderStatus);

module.exports = router;
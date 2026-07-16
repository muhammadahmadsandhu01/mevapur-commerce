const express = require('express');
const router = express.Router();
const { 
  createOrder, 
  getOrders, 
  getOrderById, 
  getMyOrders, 
  updateOrderStatus 
} = require('../controllers/orderController');

// ✅ SAHI IMPORT: authMiddleware ki jagah 'auth' use ho raha hai
const { protect, admin } = require('../middleware/auth');

// Admin: view all orders
router.get('/', protect, admin, getOrders);

// Customer: view own order history
router.get('/my-orders', protect, getMyOrders);

// View a single order — owner or admin only (checked in controller)
router.get('/:id', protect, getOrderById);

// Customer: place a new order
router.post('/', protect, createOrder);

// Admin: update order status
router.put('/:id/status', protect, admin, updateOrderStatus);

module.exports = router;
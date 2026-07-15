const express = require('express');
const router = express.Router();
const { 
  createOrder, 
  getOrders, 
  getOrderById, 
  getMyOrders, 
  updateOrderStatus 
} = require('../controllers/orderController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', protect, getOrders);  // Admin ke liye
router.get('/my-orders', protect, getMyOrders);  // Customer ke liye
router.get('/:id', protect, getOrderById);

// Customer order create kar sakta hai (admin nahi chahiye)
router.post('/', protect, createOrder);

// Sirf admin order status update kar sakta hai
router.put('/:id/status', protect, admin, updateOrderStatus);

module.exports = router;
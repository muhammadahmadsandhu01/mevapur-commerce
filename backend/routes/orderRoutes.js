const express = require('express');
const router = express.Router();
const { 
  createOrder, 
  getOrders, 
  getOrderById, 
  getMyOrders, 
  updateOrderStatus,
  cancelOrder,
  getRecentOrders,    // 🌟 ADDED
  getOrderStats       // 🌟 ADDED
} = require('../controllers/orderController');

const { protect, admin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const ERROR_CODES = require('../constants/errorCodes');
const {
  createOrderSchema,
  idempotencyHeaderSchema,
  orderReferenceSchema,
  paginationSchema,
  adminOrderQuerySchema,
  updateOrderStatusSchema,
  updateTrackingSchema,
  cancelOrderSchema
} = require('../validators/orderValidator');

const orderValidation = (schema, source = 'body') => validate(schema, {
  source,
  code: ERROR_CODES.ORDER_VALIDATION_FAILED
});

// Admin: view all orders with pagination & filters
router.get(
  '/',
  protect,
  admin,
  orderValidation(adminOrderQuerySchema, 'query'),
  getOrders
);

// Admin: view recent orders (for dashboard)
router.get('/recent', protect, admin, getRecentOrders);

// Admin: view order statistics (for dashboard)
router.get('/stats', protect, admin, getOrderStats);

// Customer: view own order history
router.get(
  '/my-orders',
  protect,
  orderValidation(paginationSchema, 'query'),
  getMyOrders
);

// View a single order — owner or admin only (checked in controller)
router.get(
  '/:id',
  protect,
  orderValidation(orderReferenceSchema, 'params'),
  getOrderById
);

// Customer: place a new order
router.post(
  '/',
  protect,
  orderValidation(idempotencyHeaderSchema, 'headers'),
  orderValidation(createOrderSchema),
  createOrder
);

// Customer/admin: idempotent cancellation with ownership checks in service
router.post(
  '/:id/cancel',
  protect,
  orderValidation(orderReferenceSchema, 'params'),
  orderValidation(cancelOrderSchema),
  cancelOrder
);

// Admin: update order status
router.put(
  '/:id/status',
  protect,
  admin,
  orderValidation(orderReferenceSchema, 'params'),
  orderValidation(updateOrderStatusSchema),
  updateOrderStatus
);

router.put(
  '/:id/tracking',
  protect,
  admin,
  orderValidation(orderReferenceSchema, 'params'),
  orderValidation(updateTrackingSchema),
  require('../controllers/orderController').updateOrderTracking
);

module.exports = router;

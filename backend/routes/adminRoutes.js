const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const logger = require('../common/utils/logger');

const FinancialMetricsService = require('../services/order/FinancialMetricsService');

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const stats = await FinancialMetricsService.getDashboardStats();

    res.json({
      success: true,
      message: 'Dashboard statistics fetched successfully',
      data: stats
    });
  } catch (error) {
    logger.error('Admin statistics query failed', {
      errorCode: error.code,
      errorName: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// @desc    Get recent orders
// @route   GET /api/admin/orders/recent
// @access  Private/Admin
router.get('/orders/recent', protect, admin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const orders = await Order.find()
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    logger.error('Admin recent-orders query failed', {
      errorCode: error.code,
      errorName: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent orders'
    });
  }
});

// @desc    Get top selling products
// @route   GET /api/admin/products/top
// @access  Private/Admin
router.get('/products/top', protect, admin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const products = await Product.find()
      .sort({ soldCount: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    logger.error('Admin top-products query failed', {
      errorCode: error.code,
      errorName: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top products'
    });
  }
});

// @desc    Get dashboard analytics (Revenue time-series and category breakdown)
// @route   GET /api/admin/analytics
// @access  Private/Admin
router.get('/analytics', protect, admin, async (req, res) => {
  try {
    const [salesReport, productStats] = await Promise.all([
      FinancialMetricsService.getSalesReport(req.query),
      FinancialMetricsService.getProductStats(req.query)
    ]);
    res.json({
      success: true,
      data: {
        chartData: salesReport.chartData || [],
        chartDataByCurrency: salesReport.chartDataByCurrency || {},
        categoryStats: productStats.categoryStats || [],
        categoryStatsByCurrency: productStats.categoryStatsByCurrency || {}
      }
    });
  } catch (error) {
    logger.error('Admin analytics query failed', {
      errorCode: error.code,
      errorName: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
});

const paymentWebhookController = require('../controllers/paymentWebhookController');

// @desc    Get payment webhook inbox health statistics
// @route   GET /api/admin/payments/webhooks/health
// @access  Private/Admin
router.get('/payments/webhooks/health', protect, admin, paymentWebhookController.getWebhookHealth);
router.get('/payments/webhook/health', protect, admin, paymentWebhookController.getWebhookHealth);

const codSettingsController = require('../controllers/codSettingsController');

// @desc    Get and update COD settings (disallowed cities & status)
// @route   GET /api/admin/settings/cod, PUT /api/admin/settings/cod
// @access  Private/Admin
router.get('/settings/cod', protect, admin, codSettingsController.getCodSettings);
router.put('/settings/cod', protect, admin, codSettingsController.updateCodSettings);

const userController = require('../controllers/userController');

// @desc    Unlock user account
// @route   POST /api/admin/users/:id/unlock, PUT /api/admin/users/:id/unlock
// @access  Private/Admin
router.post('/users/:id/unlock', protect, admin, userController.unlockUser);
router.put('/users/:id/unlock', protect, admin, userController.unlockUser);
router.post('/customers/:id/unlock', protect, admin, userController.unlockUser);
router.put('/customers/:id/unlock', protect, admin, userController.unlockUser);

const { updateOrderPaymentStatus } = require('../controllers/orderController');
const validate = require('../middleware/validate');
const ERROR_CODES = require('../constants/errorCodes');
const {
  orderReferenceSchema,
  updatePaymentStatusSchema
} = require('../validators/orderValidator');

const orderValidation = (schema, source = 'body') => validate(schema, {
  source,
  code: ERROR_CODES.ORDER_VALIDATION_FAILED
});

// @desc    Update order payment status (COD payment reconciliation)
// @route   PATCH /api/admin/orders/:id/payment-status, PATCH /api/admin/orders/:id/payment
// @access  Private/Admin
router.patch('/orders/:id/payment-status', protect, admin, orderValidation(orderReferenceSchema, 'params'), orderValidation(updatePaymentStatusSchema), updateOrderPaymentStatus);
router.patch('/orders/:id/payment', protect, admin, orderValidation(orderReferenceSchema, 'params'), orderValidation(updatePaymentStatusSchema), updateOrderPaymentStatus);
router.post('/orders/:id/mark-paid', protect, admin, orderValidation(orderReferenceSchema, 'params'), orderValidation(updatePaymentStatusSchema), updateOrderPaymentStatus);
router.post('/orders/:id/payment', protect, admin, orderValidation(orderReferenceSchema, 'params'), orderValidation(updatePaymentStatusSchema), updateOrderPaymentStatus);

module.exports = router;

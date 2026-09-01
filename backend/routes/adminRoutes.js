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

module.exports = router;

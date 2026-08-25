const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const logger = require('../common/utils/logger');

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const revenueStats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
          todayRevenue: {
            $sum: {
              $cond: [
                { $gte: ['$createdAt', today] },
                { $ifNull: ['$totalAmount', 0] },
                0
              ]
            }
          },
          monthlyRevenue: {
            $sum: {
              $cond: [
                { $gte: ['$createdAt', thisMonth] },
                { $ifNull: ['$totalAmount', 0] },
                0
              ]
            }
          }
        }
      }
    ]);

    const totalRevenue = revenueStats[0]?.totalRevenue || 0;
    const todayRevenue = revenueStats[0]?.todayRevenue || 0;
    const monthlyRevenue = revenueStats[0]?.monthlyRevenue || 0;

    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ orderStatus: 'Pending' });
    const processingOrders = await Order.countDocuments({ orderStatus: 'Processing' });
    const shippedOrders = await Order.countDocuments({ orderStatus: 'Shipped' });
    const deliveredOrders = await Order.countDocuments({ orderStatus: 'Delivered' });
    const cancelledOrders = await Order.countDocuments({ orderStatus: 'Cancelled' });

    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const newCustomers = await User.countDocuments({
      role: 'customer',
      createdAt: { $gte: today }
    });

    const totalProducts = await Product.countDocuments();
    const lowStockProducts = await Product.countDocuments({
      stock: { $lt: 50, $gt: 0 }
    });
    const outOfStockProducts = await Product.countDocuments({ stock: 0 });

    res.json({
      success: true,
      message: 'Dashboard statistics fetched successfully',
      data: {
        totalRevenue,
        todayRevenue,
        monthlyRevenue,
        revenueGrowth: null,
        totalOrders,
        pendingOrders,
        processingOrders,
        shippedOrders,
        deliveredOrders,
        cancelledOrders,
        ordersGrowth: null,
        totalCustomers,
        newCustomers,
        customersGrowth: null,
        totalProducts,
        lowStockProducts,
        outOfStockProducts,
        productsGrowth: null,
        averageOrderValue: totalOrders > 0 ? (totalRevenue / totalOrders) : 0,
        conversionRate: null
      }
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

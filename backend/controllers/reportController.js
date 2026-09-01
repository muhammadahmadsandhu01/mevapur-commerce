const FinancialMetricsService = require('../services/order/FinancialMetricsService');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { formatCsv, safeContentDisposition } = require('../utils/csvHelper');

// @desc    Get sales report
// @route   GET /api/reports/sales
// @access  Private/Admin
exports.getSalesReport = async (req, res) => {
  try {
    const data = await FinancialMetricsService.getSalesReport(req.query);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch sales report'
    });
  }
};

// @desc    Get product performance report
// @route   GET /api/reports/products
// @access  Private/Admin
exports.getProductReport = async (req, res) => {
  try {
    const data = await FinancialMetricsService.getProductReport(req.query);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Product report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch product report'
    });
  }
};

// @desc    Get customer report
// @route   GET /api/reports/customers
// @access  Private/Admin
exports.getCustomerReport = async (req, res) => {
  try {
    const data = await FinancialMetricsService.getCustomerReport(req.query);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Customer report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch customer report'
    });
  }
};

// @desc    Get order report
// @route   GET /api/reports/orders
// @access  Private/Admin
exports.getOrderReport = async (req, res) => {
  try {
    const data = await FinancialMetricsService.getOrderReport(req.query);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Order report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch order report'
    });
  }
};

// @desc    Get dashboard analytics (month comparison)
// @route   GET /api/reports/analytics
// @access  Private/Admin
exports.getAnalytics = async (req, res) => {
  try {
    const data = await FinancialMetricsService.getAnalytics();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch analytics'
    });
  }
};

// @desc    Export report to CSV
// @route   GET /api/reports/export/:type
// @access  Private/Admin
exports.exportReport = async (req, res) => {
  try {
    const { type } = req.params;
    const MAX_EXPORT_LIMIT = 5000;

    let headers = [];
    let rows = [];

    if (type === 'orders') {
      headers = ['Order ID', 'Customer', 'Email', 'Payment Method', 'Payment Status', 'Total (PKR)', 'Status', 'Date'];
      const orders = await Order.find()
        .populate('user', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(MAX_EXPORT_LIMIT);

      rows = orders.map((order) => [
        order.orderId || String(order._id),
        order.user?.fullName || order.shippingAddress?.fullName || 'N/A',
        order.user?.email || 'N/A',
        order.paymentMethod || 'N/A',
        order.paymentStatus || 'Pending',
        order.totalAmount ?? 0,
        order.orderStatus || 'Pending',
        order.createdAt ? new Date(order.createdAt).toISOString() : ''
      ]);
    } else if (type === 'products') {
      headers = ['Product Name', 'SKU', 'Category', 'Price (PKR)', 'Stock', 'Sold Count'];
      const products = await Product.find()
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .limit(MAX_EXPORT_LIMIT);

      rows = products.map((p) => [
        p.name || '',
        p.sku || '',
        p.category?.name || p.category || '',
        p.price ?? 0,
        p.stock ?? 0,
        p.soldCount ?? 0
      ]);
    } else if (type === 'customers') {
      headers = ['Customer Name', 'Email', 'Phone', 'Role', 'Joined Date'];
      const customers = await User.find({ role: 'customer' })
        .select('fullName email phone role createdAt')
        .sort({ createdAt: -1 })
        .limit(MAX_EXPORT_LIMIT);

      rows = customers.map((c) => [
        c.fullName || '',
        c.email || '',
        c.phone || 'N/A',
        c.role || 'customer',
        c.createdAt ? new Date(c.createdAt).toISOString() : ''
      ]);
    } else {
      return res.status(400).json({
        success: false,
        message: `Unsupported export type: ${type}`
      });
    }

    const csvContent = formatCsv(headers, rows, { includeBom: true });
    const filename = `${type}_report_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', safeContentDisposition(filename));
    res.send(csvContent);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to export report'
    });
  }
};
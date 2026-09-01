const FinancialMetricsService = require('../services/order/FinancialMetricsService');
const {
  formatCsv,
  sanitizeFilename,
  safeContentDisposition
} = require('../utils/csvHelper');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// @desc    Get sales report
// @route   GET /api/reports/sales
// @access  Private/Admin
const getSalesReport = async (req, res) => {
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
const getProductStats = async (req, res) => {
  try {
    const data = await FinancialMetricsService.getProductStats(req.query);
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

// @desc    Get customer analytics
// @route   GET /api/reports/customers
// @access  Private/Admin
const getCustomerStats = async (req, res) => {
  try {
    const data = await FinancialMetricsService.getCustomerStats(req.query);
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

// @desc    Get order analytics
// @route   GET /api/reports/orders
// @access  Private/Admin
const getOrderStats = async (req, res) => {
  try {
    const data = await FinancialMetricsService.getOrderStats(req.query);
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

// @desc    Get general analytics (Month Comparison)
// @route   GET /api/reports/analytics
// @access  Private/Admin
const getAnalytics = async (req, res) => {
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
const exportReport = async (req, res) => {
  try {
    const { type } = req.params;
    const MAX_EXPORT_LIMIT = 5000;

    let headers = [];
    let rows = [];

    if (type === 'orders') {
      const totalCount = await Order.countDocuments();
      if (totalCount > MAX_EXPORT_LIMIT) {
        return res.status(400).json({
          success: false,
          code: 'EXPORT_LIMIT_EXCEEDED',
          message: `Export matches ${totalCount} records, which exceeds the maximum limit of ${MAX_EXPORT_LIMIT}. Please narrow your date range or filter.`,
          totalCount,
          maxLimit: MAX_EXPORT_LIMIT
        });
      }

      headers = ['Order ID', 'Customer', 'Email', 'Payment Method', 'Payment Status', 'Total (PKR)', 'Status', 'Date'];
      const orders = await Order.find()
        .populate('user', 'fullName email')
        .sort({ createdAt: -1, _id: -1 });

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
      const totalCount = await Product.countDocuments();
      if (totalCount > MAX_EXPORT_LIMIT) {
        return res.status(400).json({
          success: false,
          code: 'EXPORT_LIMIT_EXCEEDED',
          message: `Export matches ${totalCount} records, which exceeds the maximum limit of ${MAX_EXPORT_LIMIT}. Please narrow your filter.`,
          totalCount,
          maxLimit: MAX_EXPORT_LIMIT
        });
      }

      headers = ['Product Name', 'SKU', 'Category', 'Price (PKR)', 'Stock', 'Sold Count'];
      const products = await Product.find()
        .populate('category', 'name')
        .sort({ createdAt: -1, _id: -1 });

      rows = products.map((p) => [
        p.name || '',
        p.sku || '',
        p.category?.name || p.category || '',
        p.price ?? 0,
        p.stock ?? 0,
        p.soldCount ?? 0
      ]);
    } else if (type === 'customers') {
      const totalCount = await User.countDocuments({ role: 'customer' });
      if (totalCount > MAX_EXPORT_LIMIT) {
        return res.status(400).json({
          success: false,
          code: 'EXPORT_LIMIT_EXCEEDED',
          message: `Export matches ${totalCount} records, which exceeds the maximum limit of ${MAX_EXPORT_LIMIT}. Please narrow your filter.`,
          totalCount,
          maxLimit: MAX_EXPORT_LIMIT
        });
      }

      headers = ['Customer Name', 'Email', 'Phone', 'Role', 'Joined Date'];
      const customers = await User.find({ role: 'customer' })
        .select('fullName email phone role createdAt')
        .sort({ createdAt: -1, _id: -1 });

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
        message: 'Unsupported export type. Allowed types: orders, products, customers'
      });
    }

    const csvData = formatCsv(headers, rows);
    const filename = sanitizeFilename(`${type}_report_${new Date().toISOString().slice(0, 10)}.csv`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', safeContentDisposition(filename));
    res.setHeader('X-Export-Row-Count', String(rows.length));
    return res.status(200).send(csvData);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to export report'
    });
  }
};

module.exports = {
  getSalesReport,
  getProductStats,
  getProductReport: getProductStats,
  getCustomerStats,
  getCustomerReport: getCustomerStats,
  getOrderStats,
  getOrderReport: getOrderStats,
  getAnalytics,
  exportReport
};

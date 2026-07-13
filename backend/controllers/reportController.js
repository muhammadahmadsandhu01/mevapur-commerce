const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Review = require('../models/Review');

// @desc    Get sales report
// @route   GET /api/reports/sales
// @access  Private/Admin
exports.getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, period = 'daily' } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    } else {
      // Default: last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter = { createdAt: { $gte: thirtyDaysAgo } };
    }

    // Get orders
    const orders = await Order.find({
      ...dateFilter,
      orderStatus: { $ne: 'Cancelled' }
    }).sort({ createdAt: 1 });

    // Calculate totals
    const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Group by period
    const salesByPeriod = {};
    orders.forEach(order => {
      const date = new Date(order.createdAt);
      let key;
      
      if (period === 'daily') {
        key = date.toISOString().split('T')[0];
      } else if (period === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else if (period === 'monthly') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = date.getFullYear().toString();
      }

      if (!salesByPeriod[key]) {
        salesByPeriod[key] = { revenue: 0, orders: 0 };
      }
      salesByPeriod[key].revenue += order.totalAmount || 0;
      salesByPeriod[key].orders += 1;
    });

    // Convert to array for chart
    const chartData = Object.entries(salesByPeriod)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Payment method breakdown
    const paymentMethods = await Order.aggregate([
      { $match: { ...dateFilter, orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
      { $sort: { total: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalOrders,
          averageOrderValue,
          period: `${startDate || '30 days ago'} to ${endDate || 'today'}`
        },
        chartData,
        paymentMethods,
        orders
      }
    });
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get product performance report
// @route   GET /api/reports/products
// @access  Private/Admin
exports.getProductReport = async (req, res) => {
  try {
    const { sortBy = 'soldCount', limit = 10 } = req.query;

    // Top selling products
    const topProducts = await Product.find()
      .sort({ [sortBy]: -1 })
      .limit(Number(limit))
      .select('name price stock soldCount category images');

    // Category-wise sales
    const categoryStats = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'Cancelled' } } },
      { $unwind: '$items' },
      { $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      { $group: {
          _id: '$product.category',
          totalSales: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          productCount: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    // Low stock products
    const lowStockProducts = await Product.find({
      stock: { $lt: 50, $gt: 0 }
    }).sort({ stock: 1 }).limit(20);

    // Out of stock
    const outOfStock = await Product.countDocuments({ stock: 0 });

    res.json({
      success: true,
      data: {
        topProducts,
        categoryStats,
        lowStockProducts,
        outOfStockCount: outOfStock,
        totalProducts: await Product.countDocuments()
      }
    });
  } catch (error) {
    console.error('Product report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get customer report
// @route   GET /api/reports/customers
// @access  Private/Admin
exports.getCustomerReport = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Total customers
    const totalCustomers = await User.countDocuments({ role: 'customer' });

    // New customers in period
    const newCustomers = await User.countDocuments({
      role: 'customer',
      createdAt: { $gte: cutoffDate }
    });

    // Top spenders
    const topSpenders = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'Cancelled' } } },
      { $group: {
          _id: '$user',
          totalSpent: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      { $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $project: {
          userId: '$_id',
          fullName: '$user.fullName',
          email: '$user.email',
          totalSpent: 1,
          orderCount: 1
        }
      }
    ]);

    // Customer growth chart (last 30 days)
    const customerGrowth = await User.aggregate([
      { $match: { role: 'customer', createdAt: { $gte: cutoffDate } } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalCustomers,
          newCustomers,
          growthRate: totalCustomers > 0 ? ((newCustomers / totalCustomers) * 100).toFixed(2) : 0
        },
        topSpenders,
        customerGrowth: customerGrowth.map(item => ({
          date: item._id,
          newCustomers: item.count
        }))
      }
    });
  } catch (error) {
    console.error('Customer report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get order report
// @route   GET /api/reports/orders
// @access  Private/Admin
exports.getOrderReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }

    // Status breakdown
    const statusBreakdown = await Order.aggregate([
      { $match: dateFilter },
      { $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalValue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Recent orders
    const recentOrders = await Order.find(dateFilter)
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(50);

    // Average processing time
    const deliveredOrders = await Order.find({
      ...dateFilter,
      orderStatus: 'Delivered',
      deliveredAt: { $exists: true }
    });

    let avgProcessingTime = 0;
    if (deliveredOrders.length > 0) {
      const totalTime = deliveredOrders.reduce((sum, order) => {
        const created = new Date(order.createdAt);
        const delivered = new Date(order.deliveredAt);
        return sum + (delivered - created);
      }, 0);
      avgProcessingTime = Math.round(totalTime / deliveredOrders.length / (1000 * 60 * 60 * 24));
    }

    res.json({
      success: true,
      data: {
        statusBreakdown,
        recentOrders,
        avgProcessingTime: `${avgProcessingTime} days`,
        totalOrders: await Order.countDocuments(dateFilter)
      }
    });
  } catch (error) {
    console.error('Order report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get dashboard analytics (comparison)
// @route   GET /api/reports/analytics
// @access  Private/Admin
exports.getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // This month stats
    const thisMonthOrders = await Order.find({
      createdAt: { $gte: thisMonthStart },
      orderStatus: { $ne: 'Cancelled' }
    });
    const thisMonthRevenue = thisMonthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // Last month stats
    const lastMonthOrders = await Order.find({
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      orderStatus: { $ne: 'Cancelled' }
    });
    const lastMonthRevenue = lastMonthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // Calculate growth
    const revenueGrowth = lastMonthRevenue > 0 
      ? (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(2)
      : 0;
    const orderGrowth = lastMonthOrders.length > 0
      ? (((thisMonthOrders.length - lastMonthOrders.length) / lastMonthOrders.length) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        thisMonth: {
          revenue: thisMonthRevenue,
          orders: thisMonthOrders.length
        },
        lastMonth: {
          revenue: lastMonthRevenue,
          orders: lastMonthOrders.length
        },
        growth: {
          revenue: parseFloat(revenueGrowth),
          orders: parseFloat(orderGrowth)
        }
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500.0).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Export report to CSV
// @route   GET /api/reports/export/:type
// @access  Private/Admin
exports.exportReport = async (req, res) => {
  try {
    const { type } = req.params;
    let csvContent = '';

    if (type === 'orders') {
      const orders = await Order.find()
        .populate('user', 'fullName email')
        .sort({ createdAt: -1 });
      
      csvContent = 'Order ID,Customer,Email,Total,Status,Date\n';
      orders.forEach(order => {
        csvContent += `${order.orderId},${order.user?.fullName || 'N/A'},${order.user?.email || 'N/A'},${order.totalAmount},${order.orderStatus},${order.createdAt}\n`;
      });
    } else if (type === 'products') {
      const products = await Product.find();
      csvContent = 'Name,SKU,Category,Price,Stock,Sold\n';
      products.forEach(p => {
        csvContent += `"${p.name}",${p.sku},${p.category},${p.price},${p.stock},${p.soldCount}\n`;
      });
    } else if (type === 'customers') {
      const customers = await User.find({ role: 'customer' });
      csvContent = 'Name,Email,Phone,Joined\n';
      customers.forEach(c => {
        csvContent += `"${c.fullName}",${c.email},${c.phone || 'N/A'},${c.createdAt}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_report_${Date.now()}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
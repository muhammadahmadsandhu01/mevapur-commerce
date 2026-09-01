const Order = require('../../models/Order');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Refund = require('../../models/Refund');
const Payment = require('../../models/Payment');
const { ORDER_STATUSES } = require('../../constants/orderConstants');
const { PAYMENT_STATUSES, REFUND_STATUSES } = require('../../constants/paymentConstants');

/**
 * Authoritative financial metrics and commercial aggregation service.
 * Enforces canonical financial semantics, strict half-open date intervals,
 * and database-driven aggregations across Dashboard, Reports, and Analytics.
 */
class FinancialMetricsService {
  /**
   * Safe 2-decimal rounding for currency values in PKR.
   * @param {number} value
   * @returns {number}
   */
  static roundMoney(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /**
   * Deterministic half-open interval for Today: [today 00:00:00.000, tomorrow 00:00:00.000)
   */
  static getTodayInterval() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  /**
   * Deterministic half-open interval for This Month: [1st of this month, 1st of next month)
   */
  static getThisMonthInterval() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return { start, end };
  }

  /**
   * Deterministic half-open interval for Last Month: [1st of last month, 1st of this month)
   */
  static getLastMonthInterval() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { start, end };
  }

  /**
   * Parse user-provided date range into half-open interval [start, endExclusive).
   */
  static parseDateRange(startDateStr, endDateStr, defaultDays = 30) {
    if (startDateStr && endDateStr) {
      const start = new Date(startDateStr);
      let end = new Date(endDateStr);
      // If date string is YYYY-MM-DD (length 10), make end exclusive by advancing to next day at 00:00:00
      if (typeof endDateStr === 'string' && endDateStr.trim().length === 10) {
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);
      }
      return { start, end };
    }

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - defaultDays);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  /**
   * Compute percentage growth rate between previous and current period values.
   */
  static computeGrowthRate(current, previous) {
    if (typeof previous !== 'number' || previous <= 0) {
      return (typeof current === 'number' && current > 0) ? 100 : null;
    }
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  /**
   * Aggregation pipeline to calculate realized sales revenue, gross captured,
   * refunded amount, and order counts for a given date filter.
   */
  static async aggregateRealizedRevenue(dateRange = null) {
    const matchFilter = {
      orderStatus: { $ne: ORDER_STATUSES.CANCELLED },
      paymentStatus: { $in: ['Paid', 'PartiallyRefunded', 'Refunded'] }
    };

    if (dateRange && dateRange.start && dateRange.end) {
      matchFilter.createdAt = { $gte: dateRange.start, $lt: dateRange.end };
    } else if (dateRange && dateRange.start) {
      matchFilter.createdAt = { $gte: dateRange.start };
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: 'refunds',
          let: { orderId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$order', '$$orderId'] },
                    { $eq: ['$status', REFUND_STATUSES.COMPLETED] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalRefunded: { $sum: { $ifNull: ['$amount', 0] } }
              }
            }
          ],
          as: 'refundRecords'
        }
      },
      {
        $addFields: {
          lookupRefunded: {
            $ifNull: [{ $arrayElemAt: ['$refundRecords.totalRefunded', 0] }, 0]
          }
        }
      },
      {
        $addFields: {
          effectiveRefunded: {
            $cond: [
              { $eq: ['$paymentStatus', 'Refunded'] },
              { $max: ['$totalAmount', '$lookupRefunded'] },
              '$lookupRefunded'
            ]
          }
        }
      },
      {
        $addFields: {
          netAmount: {
            $cond: [
              { $eq: ['$paymentStatus', 'Refunded'] },
              0,
              { $max: [0, { $subtract: [{ $ifNull: ['$totalAmount', 0] }, '$effectiveRefunded'] }] }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          grossCaptured: { $sum: { $ifNull: ['$totalAmount', 0] } },
          totalRefunded: { $sum: '$effectiveRefunded' },
          realizedRevenue: { $sum: '$netAmount' },
          orderCount: { $sum: 1 },
          paidOrderCount: {
            $sum: { $cond: [{ $gt: ['$netAmount', 0] }, 1, 0] }
          }
        }
      }
    ];

    const result = await Order.aggregate(pipeline);
    const summary = result[0] || {
      grossCaptured: 0,
      totalRefunded: 0,
      realizedRevenue: 0,
      orderCount: 0,
      paidOrderCount: 0
    };

    return {
      grossCaptured: FinancialMetricsService.roundMoney(summary.grossCaptured),
      totalRefunded: FinancialMetricsService.roundMoney(summary.totalRefunded),
      realizedRevenue: FinancialMetricsService.roundMoney(summary.realizedRevenue),
      orderCount: summary.orderCount,
      paidOrderCount: summary.paidOrderCount,
      averageOrderValue: summary.orderCount > 0
        ? FinancialMetricsService.roundMoney(summary.realizedRevenue / summary.orderCount)
        : 0
    };
  }

  /**
   * Aggregate Paid-but-Cancelled anomaly / liability.
   */
  static async aggregateCancelledPaidLiability(dateRange = null) {
    const matchFilter = {
      orderStatus: ORDER_STATUSES.CANCELLED,
      paymentStatus: { $in: ['Paid', 'PartiallyRefunded', 'Refunded'] }
    };

    if (dateRange && dateRange.start && dateRange.end) {
      matchFilter.createdAt = { $gte: dateRange.start, $lt: dateRange.end };
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: 'refunds',
          let: { orderId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$order', '$$orderId'] },
                    { $eq: ['$status', REFUND_STATUSES.COMPLETED] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalRefunded: { $sum: { $ifNull: ['$amount', 0] } }
              }
            }
          ],
          as: 'refundRecords'
        }
      },
      {
        $addFields: {
          lookupRefunded: {
            $ifNull: [{ $arrayElemAt: ['$refundRecords.totalRefunded', 0] }, 0]
          }
        }
      },
      {
        $addFields: {
          unrefundedBalance: {
            $cond: [
              { $eq: ['$paymentStatus', 'Refunded'] },
              0,
              { $max: [0, { $subtract: [{ $ifNull: ['$totalAmount', 0] }, '$lookupRefunded'] }] }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          unrefundedLiability: { $sum: '$unrefundedBalance' },
          anomalyOrderCount: { $sum: { $cond: [{ $gt: ['$unrefundedBalance', 0] }, 1, 0] } }
        }
      }
    ];

    const result = await Order.aggregate(pipeline);
    return {
      unrefundedLiability: FinancialMetricsService.roundMoney(result[0]?.unrefundedLiability || 0),
      anomalyOrderCount: result[0]?.anomalyOrderCount || 0
    };
  }

  /**
   * Get comprehensive Dashboard Statistics for GET /api/admin/stats.
   */
  static async getDashboardStats() {
    const todayInterval = FinancialMetricsService.getTodayInterval();
    const thisMonthInterval = FinancialMetricsService.getThisMonthInterval();
    const lastMonthInterval = FinancialMetricsService.getLastMonthInterval();

    const [
      allTimeRevenue,
      todayRevenueStats,
      thisMonthRevenueStats,
      lastMonthRevenueStats,
      cancelledLiability,
      totalOrders,
      pendingOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      thisMonthOrdersCount,
      lastMonthOrdersCount,
      totalCustomers,
      newCustomers,
      thisMonthCustomersCount,
      lastMonthCustomersCount,
      totalProducts,
      lowStockProducts,
      outOfStockProducts
    ] = await Promise.all([
      FinancialMetricsService.aggregateRealizedRevenue(null),
      FinancialMetricsService.aggregateRealizedRevenue(todayInterval),
      FinancialMetricsService.aggregateRealizedRevenue(thisMonthInterval),
      FinancialMetricsService.aggregateRealizedRevenue(lastMonthInterval),
      FinancialMetricsService.aggregateCancelledPaidLiability(null),
      Order.countDocuments(),
      Order.countDocuments({ orderStatus: ORDER_STATUSES.PENDING }),
      Order.countDocuments({ orderStatus: ORDER_STATUSES.PROCESSING }),
      Order.countDocuments({ orderStatus: ORDER_STATUSES.SHIPPED }),
      Order.countDocuments({ orderStatus: ORDER_STATUSES.DELIVERED }),
      Order.countDocuments({ orderStatus: ORDER_STATUSES.CANCELLED }),
      Order.countDocuments({ createdAt: { $gte: thisMonthInterval.start, $lt: thisMonthInterval.end } }),
      Order.countDocuments({ createdAt: { $gte: lastMonthInterval.start, $lt: lastMonthInterval.end } }),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'customer', createdAt: { $gte: todayInterval.start, $lt: todayInterval.end } }),
      User.countDocuments({ role: 'customer', createdAt: { $gte: thisMonthInterval.start, $lt: thisMonthInterval.end } }),
      User.countDocuments({ role: 'customer', createdAt: { $gte: lastMonthInterval.start, $lt: lastMonthInterval.end } }),
      Product.countDocuments(),
      Product.countDocuments({
        $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] },
        stock: { $gt: 0 }
      }),
      Product.countDocuments({ stock: { $lte: 0 } })
    ]);

    const revenueGrowth = FinancialMetricsService.computeGrowthRate(
      thisMonthRevenueStats.realizedRevenue,
      lastMonthRevenueStats.realizedRevenue
    );

    const ordersGrowth = FinancialMetricsService.computeGrowthRate(
      thisMonthOrdersCount,
      lastMonthOrdersCount
    );

    const customersGrowth = FinancialMetricsService.computeGrowthRate(
      thisMonthCustomersCount,
      lastMonthCustomersCount
    );

    return {
      totalRevenue: allTimeRevenue.realizedRevenue,
      todayRevenue: todayRevenueStats.realizedRevenue,
      monthlyRevenue: thisMonthRevenueStats.realizedRevenue,
      grossCaptured: allTimeRevenue.grossCaptured,
      totalRefunded: allTimeRevenue.totalRefunded,
      cancelledPaidLiability: cancelledLiability.unrefundedLiability,
      revenueGrowth,
      totalOrders,
      pendingOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      ordersGrowth,
      totalCustomers,
      newCustomers,
      customersGrowth,
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      productsGrowth: null,
      averageOrderValue: allTimeRevenue.averageOrderValue,
      conversionRate: null
    };
  }

  /**
   * Get Sales Report for GET /api/reports/sales.
   */
  static async getSalesReport(query = {}) {
    const { startDate, endDate, period = 'daily' } = query;
    const dateRange = FinancialMetricsService.parseDateRange(startDate, endDate, 30);

    const revenueSummary = await FinancialMetricsService.aggregateRealizedRevenue(dateRange);

    // Grouping format for chartData
    let dateFormat = '%Y-%m-%d';
    if (period === 'monthly') {
      dateFormat = '%Y-%m';
    } else if (period === 'yearly') {
      dateFormat = '%Y';
    } else if (period === 'weekly') {
      dateFormat = '%Y-W%V';
    }

    const chartPipeline = [
      {
        $match: {
          createdAt: { $gte: dateRange.start, $lt: dateRange.end },
          orderStatus: { $ne: ORDER_STATUSES.CANCELLED },
          paymentStatus: { $in: ['Paid', 'PartiallyRefunded', 'Refunded'] }
        }
      },
      {
        $lookup: {
          from: 'refunds',
          let: { orderId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$order', '$$orderId'] },
                    { $eq: ['$status', REFUND_STATUSES.COMPLETED] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalRefunded: { $sum: { $ifNull: ['$amount', 0] } }
              }
            }
          ],
          as: 'refundRecords'
        }
      },
      {
        $addFields: {
          lookupRefunded: {
            $ifNull: [{ $arrayElemAt: ['$refundRecords.totalRefunded', 0] }, 0]
          }
        }
      },
      {
        $addFields: {
          netAmount: {
            $cond: [
              { $eq: ['$paymentStatus', 'Refunded'] },
              0,
              { $max: [0, { $subtract: [{ $ifNull: ['$totalAmount', 0] }, '$lookupRefunded'] }] }
            ]
          }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          revenue: { $sum: '$netAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const chartAggResults = await Order.aggregate(chartPipeline);
    const chartData = chartAggResults.map((item) => ({
      date: item._id,
      revenue: FinancialMetricsService.roundMoney(item.revenue),
      orders: item.orders
    }));

    // Payment methods breakdown
    const paymentMethodsPipeline = [
      {
        $match: {
          createdAt: { $gte: dateRange.start, $lt: dateRange.end },
          orderStatus: { $ne: ORDER_STATUSES.CANCELLED },
          paymentStatus: { $in: ['Paid', 'PartiallyRefunded', 'Refunded'] }
        }
      },
      {
        $lookup: {
          from: 'refunds',
          let: { orderId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$order', '$$orderId'] },
                    { $eq: ['$status', REFUND_STATUSES.COMPLETED] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalRefunded: { $sum: { $ifNull: ['$amount', 0] } }
              }
            }
          ],
          as: 'refundRecords'
        }
      },
      {
        $addFields: {
          lookupRefunded: {
            $ifNull: [{ $arrayElemAt: ['$refundRecords.totalRefunded', 0] }, 0]
          }
        }
      },
      {
        $addFields: {
          netAmount: {
            $cond: [
              { $eq: ['$paymentStatus', 'Refunded'] },
              0,
              { $max: [0, { $subtract: [{ $ifNull: ['$totalAmount', 0] }, '$lookupRefunded'] }] }
            ]
          }
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          total: { $sum: '$netAmount' }
        }
      },
      { $sort: { total: -1 } }
    ];

    const paymentMethodsAgg = await Order.aggregate(paymentMethodsPipeline);
    const paymentMethods = paymentMethodsAgg.map((pm) => ({
      _id: pm._id || 'Unknown',
      count: pm.count,
      total: FinancialMetricsService.roundMoney(pm.total)
    }));

    // Orders in period (bounded query)
    const orders = await Order.find({
      createdAt: { $gte: dateRange.start, $lt: dateRange.end },
      orderStatus: { $ne: ORDER_STATUSES.CANCELLED }
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('user', 'fullName email');

    return {
      summary: {
        totalRevenue: revenueSummary.realizedRevenue,
        totalOrders: revenueSummary.orderCount,
        averageOrderValue: revenueSummary.averageOrderValue,
        period: `${startDate || '30 days ago'} to ${endDate || 'today'}`
      },
      chartData,
      paymentMethods,
      orders
    };
  }

  /**
   * Get Product Performance Report for GET /api/reports/products.
   */
  static async getProductReport(query = {}) {
    const { sortBy = 'soldCount', limit = 10 } = query;
    const numLimit = Math.min(Math.max(1, Number(limit) || 10), 100);

    const sortObj = {};
    sortObj[sortBy === 'price' ? 'price' : sortBy === 'stock' ? 'stock' : 'soldCount'] = -1;

    const topProducts = await Product.find()
      .sort(sortObj)
      .limit(numLimit)
      .select('_id name price stock soldCount category images gallery')
      .populate('category', 'name');

    const mappedTopProducts = topProducts.map((p) => ({
      _id: String(p._id),
      name: p.name,
      price: p.price,
      stock: p.stock,
      soldCount: p.soldCount || 0,
      category: p.category?.name || p.category || undefined
    }));

    // Category-wise sales from realized orders
    const categoryStats = await Order.aggregate([
      {
        $match: {
          orderStatus: { $ne: ORDER_STATUSES.CANCELLED },
          paymentStatus: { $in: ['Paid', 'PartiallyRefunded', 'Refunded'] }
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productDoc'
        }
      },
      { $unwind: '$productDoc' },
      {
        $lookup: {
          from: 'categories',
          localField: 'productDoc.category',
          foreignField: '_id',
          as: 'categoryDoc'
        }
      },
      {
        $group: {
          _id: {
            $ifNull: [{ $arrayElemAt: ['$categoryDoc.name', 0] }, 'Uncategorized']
          },
          totalSales: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          productCount: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    const mappedCategoryStats = categoryStats.map((cs) => ({
      _id: cs._id,
      totalSales: cs.totalSales,
      totalRevenue: FinancialMetricsService.roundMoney(cs.totalRevenue),
      productCount: cs.productCount
    }));

    // Dynamic low stock products using per-product threshold (defaulting to 10)
    const lowStockDocs = await Product.find({
      $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] },
      stock: { $gt: 0 }
    })
      .sort({ stock: 1 })
      .limit(20)
      .select('_id name price stock soldCount category')
      .populate('category', 'name');

    const lowStockProducts = lowStockDocs.map((p) => ({
      _id: String(p._id),
      name: p.name,
      price: p.price,
      stock: p.stock,
      soldCount: p.soldCount || 0,
      category: p.category?.name || undefined
    }));

    const outOfStockCount = await Product.countDocuments({ stock: { $lte: 0 } });
    const totalProducts = await Product.countDocuments();

    return {
      topProducts: mappedTopProducts,
      categoryStats: mappedCategoryStats,
      lowStockProducts,
      outOfStockCount,
      totalProducts
    };
  }

  /**
   * Get Customer Report for GET /api/reports/customers.
   */
  static async getCustomerReport(query = {}) {
    const { period = '30' } = query;
    const days = Math.max(1, parseInt(period) || 30);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const newCustomers = await User.countDocuments({
      role: 'customer',
      createdAt: { $gte: cutoffDate }
    });

    const growthRate = totalCustomers > 0
      ? FinancialMetricsService.roundMoney((newCustomers / totalCustomers) * 100)
      : 0;

    // Top spenders based on realized order spend
    const topSpendersAgg = await Order.aggregate([
      {
        $match: {
          orderStatus: { $ne: ORDER_STATUSES.CANCELLED },
          paymentStatus: { $in: ['Paid', 'PartiallyRefunded', 'Refunded'] }
        }
      },
      {
        $lookup: {
          from: 'refunds',
          let: { orderId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$order', '$$orderId'] },
                    { $eq: ['$status', REFUND_STATUSES.COMPLETED] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalRefunded: { $sum: { $ifNull: ['$amount', 0] } }
              }
            }
          ],
          as: 'refundRecords'
        }
      },
      {
        $addFields: {
          lookupRefunded: {
            $ifNull: [{ $arrayElemAt: ['$refundRecords.totalRefunded', 0] }, 0]
          }
        }
      },
      {
        $addFields: {
          netAmount: {
            $cond: [
              { $eq: ['$paymentStatus', 'Refunded'] },
              0,
              { $max: [0, { $subtract: [{ $ifNull: ['$totalAmount', 0] }, '$lookupRefunded'] }] }
            ]
          }
        }
      },
      {
        $group: {
          _id: '$user',
          totalSpent: { $sum: '$netAmount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDoc'
        }
      },
      { $unwind: '$userDoc' },
      {
        $project: {
          userId: { $toString: '$_id' },
          fullName: '$userDoc.fullName',
          email: '$userDoc.email',
          totalSpent: 1,
          orderCount: 1
        }
      }
    ]);

    const topSpenders = topSpendersAgg.map((ts) => ({
      userId: ts.userId,
      fullName: ts.fullName || 'Customer',
      email: ts.email || 'N/A',
      totalSpent: FinancialMetricsService.roundMoney(ts.totalSpent),
      orderCount: ts.orderCount
    }));

    // Customer growth timeline
    const customerGrowthAgg = await User.aggregate([
      { $match: { role: 'customer', createdAt: { $gte: cutoffDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const customerGrowth = customerGrowthAgg.map((cg) => ({
      date: cg._id,
      newCustomers: cg.count
    }));

    return {
      summary: {
        totalCustomers,
        newCustomers,
        growthRate
      },
      topSpenders,
      customerGrowth
    };
  }

  /**
   * Get Order Report for GET /api/reports/orders.
   */
  static async getOrderReport(query = {}) {
    const { startDate, endDate } = query;
    const dateRange = FinancialMetricsService.parseDateRange(startDate, endDate, 30);
    const dateFilter = { createdAt: { $gte: dateRange.start, $lt: dateRange.end } };

    const statusBreakdownAgg = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ['$totalAmount', 0] } }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const statusBreakdown = statusBreakdownAgg.map((sb) => ({
      _id: sb._id || 'Unknown',
      count: sb.count,
      totalValue: FinancialMetricsService.roundMoney(sb.totalValue)
    }));

    const recentOrdersDocs = await Order.find(dateFilter)
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(50);

    const recentOrders = recentOrdersDocs.map((o) => ({
      _id: String(o._id),
      orderId: o.orderId,
      user: o.user ? { fullName: o.user.fullName, email: o.user.email } : null,
      totalAmount: o.totalAmount,
      orderStatus: o.orderStatus,
      createdAt: o.createdAt ? o.createdAt.toISOString() : new Date().toISOString()
    }));

    const deliveredOrders = await Order.find({
      ...dateFilter,
      orderStatus: ORDER_STATUSES.DELIVERED,
      deliveredAt: { $exists: true, $ne: null }
    });

    let avgProcessingTime = 0;
    if (deliveredOrders.length > 0) {
      const totalTimeMs = deliveredOrders.reduce((sum, order) => {
        const created = new Date(order.createdAt).getTime();
        const delivered = new Date(order.deliveredAt).getTime();
        return sum + Math.max(0, delivered - created);
      }, 0);
      avgProcessingTime = Math.round(totalTimeMs / deliveredOrders.length / (1000 * 60 * 60 * 24));
    }

    const totalOrders = await Order.countDocuments(dateFilter);

    return {
      statusBreakdown,
      recentOrders,
      avgProcessingTime: `${avgProcessingTime} days`,
      totalOrders
    };
  }

  /**
   * Get Analytics (Month Comparison) for GET /api/reports/analytics.
   */
  static async getAnalytics() {
    const thisMonthInterval = FinancialMetricsService.getThisMonthInterval();
    const lastMonthInterval = FinancialMetricsService.getLastMonthInterval();

    const [thisMonthStats, lastMonthStats] = await Promise.all([
      FinancialMetricsService.aggregateRealizedRevenue(thisMonthInterval),
      FinancialMetricsService.aggregateRealizedRevenue(lastMonthInterval)
    ]);

    const revenueGrowth = FinancialMetricsService.computeGrowthRate(
      thisMonthStats.realizedRevenue,
      lastMonthStats.realizedRevenue
    );

    const orderGrowth = FinancialMetricsService.computeGrowthRate(
      thisMonthStats.orderCount,
      lastMonthStats.orderCount
    );

    return {
      thisMonth: {
        revenue: thisMonthStats.realizedRevenue,
        orders: thisMonthStats.orderCount
      },
      lastMonth: {
        revenue: lastMonthStats.realizedRevenue,
        orders: lastMonthStats.orderCount
      },
      growth: {
        revenue: revenueGrowth !== null ? parseFloat(revenueGrowth) : 0,
        orders: orderGrowth !== null ? parseFloat(orderGrowth) : 0
      }
    };
  }
}

module.exports = FinancialMetricsService;

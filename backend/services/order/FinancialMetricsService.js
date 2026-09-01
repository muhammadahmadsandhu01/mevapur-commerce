const Order = require('../../models/Order');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Refund = require('../../models/Refund');
const Payment = require('../../models/Payment');
const { ORDER_STATUSES } = require('../../constants/orderConstants');
const { PAYMENT_STATUSES, REFUND_STATUSES } = require('../../constants/paymentConstants');

/**
 * Authoritative financial metrics and commercial aggregation service.
 * Enforces canonical financial semantics, explicit payment/order reconciliation,
 * verified refund authority, strict half-open date intervals, and anomaly tracking.
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
   * Percentage growth from zero is mathematically undefined and returns null.
   * @param {number} current
   * @param {number} previous
   * @returns {number|null}
   */
  static computeGrowthRate(current, previous) {
    if (typeof previous !== 'number' || typeof current !== 'number') return null;
    if (previous <= 0) return null;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  /**
   * Aggregation pipeline to calculate realized sales revenue, gross captured,
   * verified refunded amount, reconciliation metrics, and order counts.
   */
  static async aggregateRealizedRevenue(dateRange = null) {
    const matchFilter = {};
    if (dateRange && dateRange.start && dateRange.end) {
      matchFilter.createdAt = { $gte: dateRange.start, $lt: dateRange.end };
    } else if (dateRange && dateRange.start) {
      matchFilter.createdAt = { $gte: dateRange.start };
    }

    const pipeline = [
      { $match: matchFilter },
      // Lookup all Payment records for this Order
      {
        $lookup: {
          from: 'payments',
          let: { orderId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$order', '$$orderId'] }
              }
            }
          ],
          as: 'paymentDocs'
        }
      },
      // Lookup verified completed Refund records for this Order
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
            }
          ],
          as: 'refundDocs'
        }
      },
      {
        $addFields: {
          orderTotal: { $ifNull: ['$totalAmount', 0] },
          isCancelled: { $eq: ['$orderStatus', ORDER_STATUSES.CANCELLED] },
          isOrderPaid: {
            $in: ['$paymentStatus', ['Paid', 'PartiallyRefunded', 'Refunded']]
          },
          completedPayments: {
            $filter: {
              input: '$paymentDocs',
              as: 'p',
              cond: {
                $in: [
                  '$$p.status',
                  [PAYMENT_STATUSES.COMPLETED, PAYMENT_STATUSES.PARTIALLY_REFUNDED, PAYMENT_STATUSES.REFUNDED]
                ]
              }
            }
          },
          verifiedRefundedAmount: {
            $sum: '$refundDocs.amount'
          }
        }
      },
      {
        $addFields: {
          completedPaymentCount: { $size: '$completedPayments' },
          totalPaymentCount: { $size: '$paymentDocs' },
          hasCompletedPayment: { $eq: [{ $size: '$completedPayments' }, 1] },
          hasDuplicatePayments: { $gt: [{ $size: '$completedPayments' }, 1] },
          hasIncompletePaymentsOnly: {
            $and: [
              { $gt: [{ $size: '$paymentDocs' }, 0] },
              { $eq: [{ $size: '$completedPayments' }, 0] }
            ]
          }
        }
      },
      {
        $addFields: {
          // Classification 1: Reconciled Capture (1 completed payment, order marked paid, non-cancelled)
          isReconciledCapture: {
            $and: [
              { $eq: ['$completedPaymentCount', 1] },
              '$isOrderPaid',
              { $not: '$isCancelled' }
            ]
          },
          // Classification 2: Legacy Order Capture (0 payments in DB, order marked paid, non-cancelled)
          isLegacyOrderCapture: {
            $and: [
              { $eq: ['$totalPaymentCount', 0] },
              '$isOrderPaid',
              { $not: '$isCancelled' }
            ]
          },
          // Classification 3: Payment/Order Mismatch
          // (a) Payment completed but order not marked paid
          // (b) Order marked paid but payment failed/pending only
          // (c) Duplicate completed payments
          isPaymentOrderMismatch: {
            $or: [
              {
                $and: [
                  { $gte: ['$completedPaymentCount', 1] },
                  { $not: '$isOrderPaid' }
                ]
              },
              {
                $and: [
                  '$isOrderPaid',
                  '$hasIncompletePaymentsOnly'
                ]
              },
              '$hasDuplicatePayments'
            ]
          },
          // Classification 4: Refund Mismatch
          // (a) Order marked Refunded but verified refunds < totalAmount
          // (b) Order marked Paid but verified refunds > 0
          // (c) Order marked PartiallyRefunded but verified refunds == 0
          isRefundMismatch: {
            $or: [
              {
                $and: [
                  { $eq: ['$paymentStatus', 'Refunded'] },
                  { $lt: ['$verifiedRefundedAmount', '$orderTotal'] }
                ]
              },
              {
                $and: [
                  { $eq: ['$paymentStatus', 'Paid'] },
                  { $gt: ['$verifiedRefundedAmount', 0] }
                ]
              },
              {
                $and: [
                  { $eq: ['$paymentStatus', 'PartiallyRefunded'] },
                  { $eq: ['$verifiedRefundedAmount', 0] }
                ]
              }
            ]
          },
          // Classification 5: Over-Refund Anomaly
          isOverRefund: {
            $gt: ['$verifiedRefundedAmount', '$orderTotal']
          }
        }
      },
      {
        $addFields: {
          isValidCapturedRevenueOrder: {
            $or: ['$isReconciledCapture', '$isLegacyOrderCapture']
          },
          netRevenue: {
            $cond: [
              { $or: ['$isReconciledCapture', '$isLegacyOrderCapture'] },
              { $max: [0, { $subtract: ['$orderTotal', '$verifiedRefundedAmount'] }] },
              0
            ]
          },
          deductedRefund: {
            $cond: [
              { $or: ['$isReconciledCapture', '$isLegacyOrderCapture'] },
              { $min: ['$orderTotal', '$verifiedRefundedAmount'] },
              0
            ]
          },
          overRefundAmount: {
            $cond: [
              { $gt: ['$verifiedRefundedAmount', '$orderTotal'] },
              { $subtract: ['$verifiedRefundedAmount', '$orderTotal'] },
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          grossCaptured: {
            $sum: {
              $cond: ['$isValidCapturedRevenueOrder', '$orderTotal', 0]
            }
          },
          totalRefunded: {
            $sum: '$deductedRefund'
          },
          realizedRevenue: {
            $sum: '$netRevenue'
          },
          orderCount: {
            $sum: { $cond: ['$isValidCapturedRevenueOrder', 1, 0] }
          },
          paidOrderCount: {
            $sum: { $cond: [{ $gt: ['$netRevenue', 0] }, 1, 0] }
          },
          reconciledCaptureCount: {
            $sum: { $cond: ['$isReconciledCapture', 1, 0] }
          },
          reconciledCaptureAmount: {
            $sum: { $cond: ['$isReconciledCapture', '$orderTotal', 0] }
          },
          legacyOrderCaptureCount: {
            $sum: { $cond: ['$isLegacyOrderCapture', 1, 0] }
          },
          legacyOrderCaptureAmount: {
            $sum: { $cond: ['$isLegacyOrderCapture', '$orderTotal', 0] }
          },
          paymentOrderMismatchCount: {
            $sum: { $cond: ['$isPaymentOrderMismatch', 1, 0] }
          },
          paymentOrderMismatchAmount: {
            $sum: { $cond: ['$isPaymentOrderMismatch', '$orderTotal', 0] }
          },
          refundMismatchCount: {
            $sum: { $cond: ['$isRefundMismatch', 1, 0] }
          },
          refundMismatchAmount: {
            $sum: {
              $cond: [
                '$isRefundMismatch',
                {
                  $cond: [
                    { $eq: ['$paymentStatus', 'Refunded'] },
                    { $subtract: ['$orderTotal', '$verifiedRefundedAmount'] },
                    '$verifiedRefundedAmount'
                  ]
                },
                0
              ]
            }
          },
          overRefundCount: {
            $sum: { $cond: ['$isOverRefund', 1, 0] }
          },
          overRefundAmount: {
            $sum: '$overRefundAmount'
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
      paidOrderCount: 0,
      reconciledCaptureCount: 0,
      reconciledCaptureAmount: 0,
      legacyOrderCaptureCount: 0,
      legacyOrderCaptureAmount: 0,
      paymentOrderMismatchCount: 0,
      paymentOrderMismatchAmount: 0,
      refundMismatchCount: 0,
      refundMismatchAmount: 0,
      overRefundCount: 0,
      overRefundAmount: 0
    };

    return {
      grossCaptured: FinancialMetricsService.roundMoney(summary.grossCaptured),
      totalRefunded: FinancialMetricsService.roundMoney(summary.totalRefunded),
      realizedRevenue: FinancialMetricsService.roundMoney(summary.realizedRevenue),
      netCollected: FinancialMetricsService.roundMoney(summary.realizedRevenue),
      orderCount: summary.orderCount,
      paidOrderCount: summary.paidOrderCount,
      reconciledCaptureCount: summary.reconciledCaptureCount,
      reconciledCaptureAmount: FinancialMetricsService.roundMoney(summary.reconciledCaptureAmount),
      legacyOrderCaptureCount: summary.legacyOrderCaptureCount,
      legacyOrderCaptureAmount: FinancialMetricsService.roundMoney(summary.legacyOrderCaptureAmount),
      paymentOrderMismatchCount: summary.paymentOrderMismatchCount,
      paymentOrderMismatchAmount: FinancialMetricsService.roundMoney(summary.paymentOrderMismatchAmount),
      refundReconciliationMismatchCount: summary.refundMismatchCount,
      refundReconciliationMismatchAmount: FinancialMetricsService.roundMoney(summary.refundMismatchAmount),
      overRefundAnomalyCount: summary.overRefundCount,
      overRefundAnomalyAmount: FinancialMetricsService.roundMoney(summary.overRefundAmount),
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
            }
          ],
          as: 'refundDocs'
        }
      },
      {
        $addFields: {
          verifiedRefunded: { $sum: '$refundDocs.amount' },
          orderTotal: { $ifNull: ['$totalAmount', 0] }
        }
      },
      {
        $addFields: {
          unrefundedBalance: {
            $max: [0, { $subtract: ['$orderTotal', '$verifiedRefunded'] }]
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
      legacyOrderCaptureCount: allTimeRevenue.legacyOrderCaptureCount,
      legacyOrderCaptureAmount: allTimeRevenue.legacyOrderCaptureAmount,
      paymentOrderMismatchCount: allTimeRevenue.paymentOrderMismatchCount,
      paymentOrderMismatchAmount: allTimeRevenue.paymentOrderMismatchAmount,
      refundReconciliationMismatchCount: allTimeRevenue.refundReconciliationMismatchCount,
      refundReconciliationMismatchAmount: allTimeRevenue.refundReconciliationMismatchAmount,
      overRefundAnomalyCount: allTimeRevenue.overRefundAnomalyCount,
      overRefundAnomalyAmount: allTimeRevenue.overRefundAnomalyAmount,
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

    let dateFormat = '%Y-%m-%d';
    if (period === 'monthly') {
      dateFormat = '%Y-%m';
    } else if (period === 'yearly') {
      dateFormat = '%Y';
    }

    const chartAggregation = await Order.aggregate([
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
            }
          ],
          as: 'refundDocs'
        }
      },
      {
        $addFields: {
          verifiedRefunded: { $sum: '$refundDocs.amount' },
          orderTotal: { $ifNull: ['$totalAmount', 0] }
        }
      },
      {
        $addFields: {
          netAmount: {
            $max: [0, { $subtract: ['$orderTotal', '$verifiedRefunded'] }]
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
    ]);

    const chartData = chartAggregation.map((c) => ({
      date: c._id,
      revenue: FinancialMetricsService.roundMoney(c.revenue),
      orders: c.orders
    }));

    const paymentMethodsAgg = await Order.aggregate([
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
            }
          ],
          as: 'refundDocs'
        }
      },
      {
        $addFields: {
          verifiedRefunded: { $sum: '$refundDocs.amount' },
          orderTotal: { $ifNull: ['$totalAmount', 0] }
        }
      },
      {
        $addFields: {
          netAmount: {
            $max: [0, { $subtract: ['$orderTotal', '$verifiedRefunded'] }]
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
    ]);

    const paymentMethods = paymentMethodsAgg.map((pm) => ({
      _id: pm._id,
      count: pm.count,
      total: FinancialMetricsService.roundMoney(pm.total)
    }));

    return {
      summary: {
        totalRevenue: revenueSummary.realizedRevenue,
        totalOrders: revenueSummary.orderCount,
        averageOrderValue: revenueSummary.averageOrderValue,
        period: `${dateRange.start.toISOString().slice(0, 10)} to ${dateRange.end.toISOString().slice(0, 10)}`
      },
      chartData,
      paymentMethods
    };
  }

  /**
   * Get Product Performance Report for GET /api/reports/products.
   */
  static async getProductStats(query = {}) {
    const { sortBy = 'soldCount', limit = 10 } = query;
    const limitNum = Number(limit) || 10;

    let sortOption = { soldCount: -1 };
    if (sortBy === 'price') sortOption = { price: -1 };
    if (sortBy === 'stock') sortOption = { stock: -1 };

    const topProducts = await Product.find()
      .populate('category', 'name')
      .sort(sortOption)
      .limit(limitNum);

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

    const lowStockDocs = await Product.find({
      $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] },
      stock: { $gt: 0 }
    })
      .sort({ stock: 1 })
      .limit(20);

    const [outOfStockCount, totalProducts] = await Promise.all([
      Product.countDocuments({ stock: { $lte: 0 } }),
      Product.countDocuments()
    ]);

    return {
      topProducts,
      categoryStats: mappedCategoryStats,
      lowStockProducts: lowStockDocs,
      outOfStockCount,
      totalProducts
    };
  }

  /**
   * Get Customer Activity Report for GET /api/reports/customers.
   */
  static async getCustomerStats(query = {}) {
    const { period = 30 } = query;
    const days = parseInt(period, 10) || 30;
    const dateRange = FinancialMetricsService.parseDateRange(null, null, days);

    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const newCustomers = await User.countDocuments({
      role: 'customer',
      createdAt: { $gte: dateRange.start, $lt: dateRange.end }
    });

    const growthRate = totalCustomers > 0
      ? FinancialMetricsService.roundMoney((newCustomers / totalCustomers) * 100)
      : 0;

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
            }
          ],
          as: 'refundDocs'
        }
      },
      {
        $addFields: {
          verifiedRefunded: { $sum: '$refundDocs.amount' },
          orderTotal: { $ifNull: ['$totalAmount', 0] }
        }
      },
      {
        $addFields: {
          netAmount: {
            $max: [0, { $subtract: ['$orderTotal', '$verifiedRefunded'] }]
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

    const customerGrowthAgg = await User.aggregate([
      {
        $match: {
          role: 'customer',
          createdAt: { $gte: dateRange.start, $lt: dateRange.end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          newCustomers: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const customerGrowth = customerGrowthAgg.map((cg) => ({
      date: cg._id,
      newCustomers: cg.newCustomers
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
   * Get Orders Report for GET /api/reports/orders.
   */
  static async getOrderStats(query = {}) {
    const { startDate, endDate } = query;
    const dateRange = FinancialMetricsService.parseDateRange(startDate, endDate, 30);

    const matchQuery = {
      createdAt: { $gte: dateRange.start, $lt: dateRange.end }
    };

    const statusBreakdown = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ['$totalAmount', 0] } }
        }
      }
    ]);

    const recentOrders = await Order.find(matchQuery)
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(10);

    const totalOrders = await Order.countDocuments(matchQuery);

    const deliveredOrders = await Order.find({
      ...matchQuery,
      orderStatus: ORDER_STATUSES.DELIVERED
    }).select('createdAt updatedAt statusTimeline');

    let avgProcessingTime = 0;
    if (deliveredOrders.length > 0) {
      const totalDurationDays = deliveredOrders.reduce((sum, order) => {
        const deliveredEntry = order.statusTimeline?.find((st) => st.status === ORDER_STATUSES.DELIVERED);
        const deliveredTime = deliveredEntry?.timestamp || order.updatedAt || order.createdAt;
        const durationDays = (new Date(deliveredTime) - new Date(order.createdAt)) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, durationDays);
      }, 0);
      avgProcessingTime = FinancialMetricsService.roundMoney(totalDurationDays / deliveredOrders.length);
    }

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
        revenue: revenueGrowth,
        orders: orderGrowth
      }
    };
  }
}

module.exports = FinancialMetricsService;

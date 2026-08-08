const OrderService = require('../services/order/OrderService');
const Order = require('../models/Order');
const logger = require('../utils/logger');
const { ORDER_STATUSES } = require('../constants/orderConstants');

const success = (res, statusCode, data, requestId) => res
  .status(statusCode)
  .json({
    success: true,
    data,
    meta: {
      requestId: requestId || 'unknown'
    }
  });

/**
 * @desc    Create new order
 * @route   POST /api/orders
 * @access  Private
 * @body    Validated by middleware (items, address, paymentMethod)
 */
exports.createOrder = async (req, res, next) => {
  try {
    const result = await OrderService.createOrder({
      userId: req.user.id,
      orderData: req.body,
      idempotencyKey: req.get('Idempotency-Key')
    });

    logger.orderEvent(
      result.isReplay ? 'ORDER_REPLAYED' : 'ORDER_CREATED',
      result.order._id,
      req.user.id,
      result.isReplay ? 'Existing order returned' : 'Order created'
    );

    return success(
      res,
      result.isReplay ? 200 : 201,
      {
        order: result.order,
        idempotentReplay: result.isReplay
      },
      req.requestId
    );
  } catch (error) {
    logger.warn('Order creation rejected', {
      requestId: req.requestId,
      userId: req.user?.id,
      errorCode: error.code || 'ORDER_CREATE_FAILED'
    });
    return next(error);
  }
};

// @desc    Get logged-in customer's orders
// @route   GET /api/orders/my-orders
// @access  Private
exports.getMyOrders = async (req, res, next) => {
  try {
    const result = await OrderService.getCustomerOrders(
      req.user.id,
      req.query
    );
    return success(res, 200, result, req.requestId);
  } catch (error) {
    return next(error);
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await OrderService.getOrderForUser(req.params.id, req.user);
    return success(res, 200, { order }, req.requestId);
  } catch (error) {
    return next(error);
  }
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = async (req, res, next) => {
  try {
    const result = await OrderService.getAdminOrders(req.query);
    return success(res, 200, result, req.requestId);
  } catch (error) {
    return next(error);
  }
};

// @desc    Update order status (With Stock Restoration)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const result = await OrderService.transitionOrder({
      reference: req.params.id,
      actor: req.user,
      orderStatus: req.body.orderStatus,
      adminNote: req.body.adminNote || ''
    });
    logger.orderEvent(
      result.isReplay ? 'ORDER_STATUS_REPLAYED' : 'ORDER_STATUS_CHANGED',
      result.order._id,
      req.user.id,
      result.order.orderStatus
    );
    return success(
      res,
      200,
      {
        order: result.order,
        idempotentReplay: result.isReplay
      },
      req.requestId
    );
  } catch (error) {
    return next(error);
  }
};

exports.updateOrderTracking = async (req, res, next) => {
  try {
    const result = await OrderService.updateTracking({
      reference: req.params.id,
      actor: req.user,
      courierCompany: req.body.courierCompany,
      trackingNumber: req.body.trackingNumber
    });
    logger.orderEvent('ORDER_TRACKING_UPDATED', result.order._id, req.user.id, result.order.orderStatus);
    return success(res, 200, { order: result.order, idempotentReplay: result.isReplay }, req.requestId);
  } catch (error) { return next(error); }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const result = await OrderService.cancelOrder({
      reference: req.params.id,
      actor: req.user,
      reason: req.body.reason || '',
      isAdmin: ['admin', 'super_admin'].includes(req.user.role)
    });
    logger.orderEvent(
      result.isReplay ? 'ORDER_CANCEL_REPLAYED' : 'ORDER_CANCELLED',
      result.order._id,
      req.user.id,
      result.isReplay ? 'Existing cancellation returned' : 'Order cancelled'
    );
    return success(
      res,
      200,
      {
        order: result.order,
        idempotentReplay: result.isReplay
      },
      req.requestId
    );
  } catch (error) {
    return next(error);
  }
};

// @desc    Get recent orders
// @route   GET /api/orders/recent
// @access  Private/Admin
exports.getRecentOrders = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const orders = await Order.find()
      .populate('user', 'fullName')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);
    return success(res, 200, { orders }, req.requestId);
  } catch (error) {
    return next(error);
  }
};

// @desc    Get order statistics
// @route   GET /api/orders/stats
// @access  Private/Admin
exports.getOrderStats = async (req, res, next) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({
      orderStatus: ORDER_STATUSES.PENDING
    });
    const processingOrders = await Order.countDocuments({
      orderStatus: ORDER_STATUSES.PROCESSING
    });
    const shippedOrders = await Order.countDocuments({
      orderStatus: ORDER_STATUSES.SHIPPED
    });
    const deliveredOrders = await Order.countDocuments({
      orderStatus: ORDER_STATUSES.DELIVERED
    });
    const cancelledOrders = await Order.countDocuments({
      orderStatus: ORDER_STATUSES.CANCELLED
    });

    const totalRevenue = await Order.aggregate([
      {
        $match: {
          orderStatus: {
            $nin: [ORDER_STATUSES.CANCELLED, ORDER_STATUSES.PENDING]
          }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    return success(
      res,
      200,
      {
        stats: {
        totalOrders, 
        pendingOrders, 
        processingOrders, 
        shippedOrders, 
        deliveredOrders, 
        cancelledOrders, 
        totalRevenue: totalRevenue[0]?.total || 0 
        }
      },
      req.requestId
    );
  } catch (error) {
    return next(error);
  }
};

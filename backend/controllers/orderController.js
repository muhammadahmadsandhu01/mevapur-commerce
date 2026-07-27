const OrderService = require('../services/order/OrderService');
const InventoryService = require('../services/order/InventoryService');
const CouponService = require('../services/order/CouponService');
const Order = require('../models/Order');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError } = require('../errors/AppError');

/**
 * @desc    Create new order
 * @route   POST /api/orders
 * @access  Private
 * @body    Validated by middleware (items, address, paymentMethod)
 */
exports.createOrder = async (req, res, next) => {
  try {
    // Controller contains NO business logic. 
    // Data is already validated by 'validate' middleware.
    const orderData = req.body;

    // Call Service Layer
    const order = await OrderService.createOrder(req.user.id, orderData);

    // Structured Logging
    logger.orderEvent(
      'ORDER_CREATED', 
      order._id, 
      req.user.id, 
      'New order placed successfully', 
      { totalAmount: order.totalAmount }
    );

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
       order
    });

  } catch (error) {
    // Log error with context
    logger.error(`Order creation failed for user ${req.user.id}: ${error.message}`, {
      stack: error.stack,
      body: req.body
    });
    
    // Let global error handler manage response formatting if needed,
    // or handle specific known errors here for immediate feedback.
    if (error instanceof ValidationError || error.message.includes('stock')) {
      return res.status(error.statusCode || 400).json({ 
        success: false, 
        message: error.message,
        details: error.details 
      });
    }

    next(error); // Pass unexpected errors to global handler
  }
};

// @desc    Get logged-in customer's orders
// @route   GET /api/orders/my-orders
// @access  Private
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .select('-adminNotes'); 
    
    res.json({ success: true, count: orders.length,  orders });
  } catch (error) {
    logger.error('Get my orders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'fullName email phone')
      .populate('items.product', 'name images')
      .populate('coupon', 'code type value');

    if (!order) {
      throw new NotFoundError('Order');
    }

    const isOwner = order.user._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this order' });
    }

    res.json({ success: true,  order });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    logger.error('Get order error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 15, status = '', search = '' } = req.query;
    let query = {};

    if (status && status !== 'all') query.orderStatus = status;
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Order.countDocuments(query);
    
    const orders = await Order.find(query)
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      count: orders.length,
       orders,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total/limit) || 1 }
    });
  } catch (error) {
    logger.error('Get orders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update order status (With Stock Restoration)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderStatus, adminNotes } = req.body;
    const order = await Order.findById(req.params.id).session(session);

    if (!order) {
      await session.abortTransaction();
      throw new NotFoundError('Order');
    }

    if (order.orderStatus === orderStatus) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Order is already in this status' });
    }

    // Restore stock if cancelled
    if (orderStatus === 'Cancelled' && order.orderStatus !== 'Cancelled') {
      await InventoryService.restore(order.items, session);
      
      if (order.coupon) {
        await CouponService.decrementUsage(order.coupon, session);
      }
      
      logger.orderEvent('ORDER_CANCELLED', order._id, req.user.id, 'Order cancelled by admin, stock restored');
    }

    order.orderStatus = orderStatus;
    
    if (adminNotes) {
      order.adminNotes = order.adminNotes || [];
      order.adminNotes.push({ note: adminNotes, addedBy: req.user.id, addedAt: Date.now() });
    }
    
    order.statusTimeline.push({ 
      status: orderStatus, 
      timestamp: Date.now(), 
      note: adminNotes || `Status updated to ${orderStatus}` 
    });

    if (orderStatus === 'Delivered') order.deliveredAt = Date.now();
    if (orderStatus === 'Cancelled') order.cancelledAt = Date.now();

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: 'Order updated successfully',  order });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error('Update status error:', error);
    
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recent orders
// @route   GET /api/orders/recent
// @access  Private/Admin
exports.getRecentOrders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const orders = await Order.find().populate('user', 'fullName').sort({createdAt:-1}).limit(limit);
    res.json({success:true, count: orders.length,  orders});
  } catch (error) {
    logger.error('Recent orders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order statistics
// @route   GET /api/orders/stats
// @access  Private/Admin
exports.getOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ orderStatus: 'Pending' });
    const processingOrders = await Order.countDocuments({ orderStatus: 'Processing' });
    const shippedOrders = await Order.countDocuments({ orderStatus: 'Shipped' });
    const deliveredOrders = await Order.countDocuments({ orderStatus: 'Delivered' });
    const cancelledOrders = await Order.countDocuments({ orderStatus: 'Cancelled' });

    const totalRevenue = await Order.aggregate([
      { $match: { orderStatus: { $nin: ['Cancelled', 'Pending'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      success: true,
      data: { 
        totalOrders, 
        pendingOrders, 
        processingOrders, 
        shippedOrders, 
        deliveredOrders, 
        cancelledOrders, 
        totalRevenue: totalRevenue[0]?.total || 0 
      }
    });
  } catch (error) {
    logger.error('Order stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
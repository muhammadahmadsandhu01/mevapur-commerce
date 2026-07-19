const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const mongoose = require('mongoose');
const { logger } = require('../middleware/logger');

// @desc    Create new order (Checkout) with Stock Management & Coupon Validation
// @route   POST /api/orders
// @access  Private (Customer)
exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, shippingAddress, paymentMethod, subtotal, shippingCost, discount, totalAmount, notes, couponCode } = req.body;

    // 1. Basic Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
    }

    if (!shippingAddress || !paymentMethod || totalAmount === undefined) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Missing required order fields' });
    }

    let appliedCoupon = null;

    // 2. Server-Side Coupon Validation (If provided)
    if (couponCode) {
      const normalizedCode = couponCode.trim().toUpperCase();
      const coupon = await Coupon.findOne({ code: normalizedCode }).session(session);

      if (!coupon) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Invalid coupon code' });
      }

      const now = new Date();
      if (!coupon.isActive || now < coupon.startDate || now > coupon.endDate) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Coupon is not active or expired' });
      }

      if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
      }

      if (coupon.minOrderAmount > subtotal) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: `Minimum order amount for this coupon is ${coupon.minOrderAmount}` 
        });
      }

      // Increment usage count immediately within transaction
      coupon.usedCount += 1;
      await coupon.save({ session });
      appliedCoupon = coupon._id;
    }

    // 3. Verify Products & Stock
    for (const item of items) {
      const product = await Product.findById(item.product).session(session);
      
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ 
          success: false, 
          message: `Product not found: ${item.name || item.product}` 
        });
      }

      const availableStock = product.stock || 0;
      if (availableStock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient stock for ${product.name}. Only ${availableStock} left.` 
        });
      }

      // Decrement stock
      product.stock = availableStock - item.quantity;
      await product.save({ session });
    }

    // 4. Create Order
    const orderData = {
      user: req.user.id,
      items,
      shippingAddress,
      paymentMethod,
      subtotal,
      shippingCost: shippingCost || 0,
      discount: discount || 0,
      totalAmount,
      notes: notes || '',
      orderStatus: 'Pending',
      statusTimeline: [{
        status: 'Pending',
        timestamp: Date.now(),
        note: notes || 'Order placed successfully'
      }]
    };

    if (appliedCoupon) {
      orderData.coupon = appliedCoupon;
    }

    const order = await Order.create([orderData], { session });

    await session.commitTransaction();
    session.endSession();

    logger.info(`Order created: ${order[0].orderId} by User ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: order[0]
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    logger.error(`Order creation failed: ${error.message}`, error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to place order. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get logged-in customer's orders
// @route   GET /api/orders/my-orders
// @access  Private (Customer)
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .select('-adminNotes'); 
    res.json({ success: true, data: orders });
  } catch (error) {
    logger.error('Get my orders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single order (Owner or Admin only)
// @route   GET /api/orders/:id
// @access  Private
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'fullName email phone')
      .populate('items.product', 'name images')
      .populate('coupon', 'code type value');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const isOwner = order.user._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this order' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    logger.error('Get order error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all orders (Admin only)
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 15, status = '', search = '', startDate = '', endDate = '', sortBy = 'newest' } = req.query;
    let query = {};

    if (status && status !== 'all') query.orderStatus = status;
    
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    let sortOption = { createdAt: -1 };
    if (sortBy === 'oldest') sortOption = { createdAt: 1 };
    else if (sortBy === 'highest') sortOption = { totalAmount: -1 };
    else if (sortBy === 'lowest') sortOption = { totalAmount: 1 };

    const skip = (page - 1) * limit;
    const total = await Order.countDocuments(query);
    const pages = Math.ceil(total / limit) || 1;

    const orders = await Order.find(query)
      .populate('user', 'fullName email')
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: orders,
      pagination: { 
        page: Number(page), 
        limit: Number(limit), 
        total, 
        pages, 
        hasNext: page < pages, 
        hasPrev: page > 1 
      }
    });
  } catch (error) {
    logger.error('Get orders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update order status (With Stock Restoration on Cancel)
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
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Prevent redundant updates
    if (order.orderStatus === orderStatus) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Order is already in this status' });
    }

    // 🌟 STOCK RESTORATION LOGIC
    if (orderStatus === 'Cancelled' && order.orderStatus !== 'Cancelled') {
      for (const item of order.items) {
        const product = await Product.findById(item.product).session(session);
        if (product) {
          product.stock += item.quantity;
          await product.save({ session });
        }
      }
      
      // Decrement coupon usage if coupon was used
      if (order.coupon) {
        await Coupon.findByIdAndUpdate(order.coupon, { 
          $inc: { usedCount: -1 } 
        }, { session });
      }
    }

    order.orderStatus = orderStatus;
    
    if (adminNotes) {
      order.adminNotes = order.adminNotes || [];
      order.adminNotes.push({ note: adminNotes, addedBy: req.user.id, addedAt: Date.now() });
    }

    order.statusTimeline = order.statusTimeline || [];
    order.statusTimeline.push({ 
      status: orderStatus, 
      timestamp: Date.now(), 
      note: adminNotes || `Status updated to ${orderStatus}` 
    });

    if (orderStatus === 'Delivered') {
      order.deliveredAt = Date.now();
    } else if (orderStatus === 'Cancelled') {
      order.cancelledAt = Date.now();
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: 'Order status updated successfully', data: order });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error('Update order status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recent orders
// @route   GET /api/orders/recent
// @access  Private/Admin
exports.getRecentOrders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const orders = await Order.find()
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ success: true, data: orders });
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
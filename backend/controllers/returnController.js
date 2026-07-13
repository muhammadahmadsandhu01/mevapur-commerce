const Return = require('../models/Return');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { logActivity } = require('../middleware/activityLogger');

// @desc    Get all returns
// @route   GET /api/returns
// @access  Private/Admin
exports.getReturns = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status = '',
      search = '',
      startDate = '',
      endDate = ''
    } = req.query;

    let query = {};

    if (status) query.status = status;

    if (search) {
      query.$or = [
        { returnNumber: { $regex: search, $options: 'i' } },
        { 'customer.fullName': { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const total = await Return.countDocuments(query);
    const pages = Math.ceil(total / limit);

    const returns = await Return.find(query)
      .populate('order', 'orderId totalAmount')
      .populate('customer', 'fullName email phone')
      .populate('items.product', 'name images')
      .populate('adminNotes.addedBy', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: returns,
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
    console.error('Get returns error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single return
// @route   GET /api/returns/:id
// @access  Private/Admin
exports.getReturn = async (req, res) => {
  try {
    const returnItem = await Return.findById(req.params.id)
      .populate('order')
      .populate('customer', 'fullName email phone')
      .populate('items.product', 'name images price')
      .populate('adminNotes.addedBy', 'fullName email')
      .populate('approvedBy', 'fullName');

    if (!returnItem) {
      return res.status(404).json({
        success: false,
        message: 'Return not found'
      });
    }

    res.json({
      success: true,
      data: returnItem
    });
  } catch (error) {
    console.error('Get return error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create return request
// @route   POST /api/returns
// @access  Private/Admin
exports.createReturn = async (req, res) => {
  try {
    const { orderId, items, refundMethod, customerNotes } = req.body;

    const order = await Order.findById(orderId).populate('items.product');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Calculate refund amount
    let refundAmount = 0;
    const returnItems = items.map(item => {
      const orderItem = order.items.find(oi => oi.product.toString() === item.productId);
      const itemTotal = orderItem ? orderItem.price * item.quantity : 0;
      refundAmount += itemTotal;
      return {
        product: item.productId,
        name: orderItem?.name || 'Unknown',
        quantity: item.quantity,
        price: orderItem?.price || 0,
        reason: item.reason,
        reasonDetails: item.reasonDetails || '',
        images: item.images || [],
        condition: item.condition || 'new'
      };
    });

    const returnItem = await Return.create({
      order: orderId,
      customer: order.user,
      items: returnItems,
      refundMethod: refundMethod || 'original_payment',
      refundAmount,
      customerNotes: customerNotes || ''
    });

    await logActivity(req, 'RETURN_CREATE', 
      `Created return request ${returnItem.returnNumber} for order ${order.orderId}`, 
      { returnId: returnItem._id, orderId }
    );

    res.status(201).json({
      success: true,
      message: 'Return request created successfully',
      data: returnItem
    });
  } catch (error) {
    console.error('Create return error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update return status
// @route   PUT /api/returns/:id/status
// @access  Private/Admin
exports.updateReturnStatus = async (req, res) => {
  try {
    const { status, adminNotes, rejectedReason, refundAmount, trackingNumber, courierCompany } = req.body;
    const returnItem = await Return.findById(req.params.id);

    if (!returnItem) {
      return res.status(404).json({
        success: false,
        message: 'Return not found'
      });
    }

    returnItem.status = status;

    if (adminNotes) {
      returnItem.adminNotes.push({
        note: adminNotes,
        addedBy: req.user.id,
        addedAt: Date.now()
      });
    }

    if (status === 'approved') {
      returnItem.approvedBy = req.user.id;
      returnItem.approvedAt = Date.now();
    }

    if (status === 'received') {
      returnItem.receivedAt = Date.now();
    }

    if (status === 'refunded') {
      returnItem.refundedAt = Date.now();
      if (refundAmount) returnItem.refundAmount = refundAmount;
      
      // Restore product stock
      for (const item of returnItem.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity }
        });
      }
    }

    if (status === 'rejected') {
      returnItem.rejectedReason = rejectedReason || 'No reason provided';
    }

    if (trackingNumber) returnItem.trackingNumber = trackingNumber;
    if (courierCompany) returnItem.courierCompany = courierCompany;

    await returnItem.save();

    await logActivity(req, 'RETURN_STATUS_UPDATE', 
      `Updated return ${returnItem.returnNumber} status to ${status}`, 
      { returnId: returnItem._id, newStatus: status }
    );

    res.json({
      success: true,
      message: 'Return status updated successfully',
      data: returnItem
    });
  } catch (error) {
    console.error('Update return status error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Process refund
// @route   POST /api/returns/:id/refund
// @access  Private/Admin
exports.processRefund = async (req, res) => {
  try {
    const { refundAmount, refundMethod, adminNotes } = req.body;
    const returnItem = await Return.findById(req.params.id);

    if (!returnItem) {
      return res.status(404).json({
        success: false,
        message: 'Return not found'
      });
    }

    if (returnItem.status !== 'inspected' && returnItem.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Return must be inspected or approved before refund'
      });
    }

    returnItem.status = 'refunded';
    returnItem.refundAmount = refundAmount || returnItem.refundAmount;
    returnItem.refundMethod = refundMethod || returnItem.refundMethod;
    returnItem.refundedAt = Date.now();

    if (adminNotes) {
      returnItem.adminNotes.push({
        note: adminNotes,
        addedBy: req.user.id,
        addedAt: Date.now()
      });
    }

    // Restore stock
    for (const item of returnItem.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity }
      });
    }

    await returnItem.save();

    await logActivity(req, 'RETURN_REFUND', 
      `Processed refund for return ${returnItem.returnNumber}: Rs. ${returnItem.refundAmount}`, 
      { returnId: returnItem._id, amount: returnItem.refundAmount }
    );

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: returnItem
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get return statistics
// @route   GET /api/returns/stats
// @access  Private/Admin
exports.getReturnStats = async (req, res) => {
  try {
    const totalReturns = await Return.countDocuments();
    const pendingReturns = await Return.countDocuments({ status: 'pending' });
    const approvedReturns = await Return.countDocuments({ status: 'approved' });
    const refundedReturns = await Return.countDocuments({ status: 'refunded' });
    const rejectedReturns = await Return.countDocuments({ status: 'rejected' });

    const totalRefundAmount = await Return.aggregate([
      { $match: { status: 'refunded' } },
      { $group: { _id: null, total: { $sum: '$refundAmount' } } }
    ]);

    // Reason breakdown
    const reasonBreakdown = await Return.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Return rate (returns / total orders)
    const totalOrders = await Order.countDocuments();
    const returnRate = totalOrders > 0 ? ((totalReturns / totalOrders) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        totalReturns,
        pendingReturns,
        approvedReturns,
        refundedReturns,
        rejectedReturns,
        totalRefundAmount: totalRefundAmount[0]?.total || 0,
        returnRate: `${returnRate}%`,
        reasonBreakdown
      }
    });
  } catch (error) {
    console.error('Return stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
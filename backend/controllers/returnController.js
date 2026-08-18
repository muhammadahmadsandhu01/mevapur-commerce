const Return = require('../models/Return');
const Order = require('../models/Order');
const ReturnService = require('../services/ReturnService');
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
exports.createReturn = async (req, res, next) => {
  try {
    const returnItem = await ReturnService.createAdminReturn(req.body);
    const order = await Order.findById(returnItem.order).select('orderId');

    await logActivity(req, 'RETURN_CREATE', 
      `Created return request ${returnItem.returnNumber} for order ${order.orderId}`, 
      { returnId: returnItem._id, orderId: returnItem.order }
    );

    res.status(201).json({
      success: true,
      message: 'Return request created successfully',
      data: returnItem
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Update return status
// @route   PUT /api/returns/:id/status
// @access  Private/Admin
exports.updateReturnStatus = async (req, res, next) => {
  try {
    const result = req.body.status === 'refunded'
      ? await ReturnService.processRefund({
        returnId: req.params.id,
        adminId: req.user.id,
        adminNotes: req.body.adminNotes || ''
      })
      : null;
    const returnItem = result?.return || await ReturnService.updateStatus(
      req.params.id,
      req.body,
      req.user.id
    );

    await logActivity(req, 'RETURN_STATUS_UPDATE',
      `Updated return ${returnItem.returnNumber} status to ${returnItem.status}`,
      { returnId: returnItem._id, newStatus: returnItem.status }
    );

    const providerPending = result?.refund?.status === 'Processing';
    const inventoryReconciliation = returnItem.status === 'inventory_reconciliation';
    return res.status(providerPending || inventoryReconciliation ? 202 : 200).json({
      success: true,
      message: inventoryReconciliation
        ? 'Financial refund confirmed; inventory reconciliation is required'
        : providerPending
          ? 'Refund is awaiting payment-provider confirmation'
          : 'Return status updated successfully',
      data: returnItem
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Process refund
// @route   POST /api/returns/:id/refund
// @access  Private/Admin
exports.processRefund = async (req, res, next) => {
  try {
    const result = await ReturnService.processRefund({
      returnId: req.params.id,
      adminId: req.user.id,
      adminNotes: req.body.adminNotes || ''
    });
    const returnItem = result.return;

    await logActivity(req, 'RETURN_REFUND',
      `Refund reconciliation for return ${returnItem.returnNumber}: ${result.refund.status}`,
      { returnId: returnItem._id, amount: returnItem.refundAmount, refundStatus: result.refund.status }
    );

    const providerPending = result.refund.status === 'Processing';
    const inventoryReconciliation = returnItem.status === 'inventory_reconciliation';
    return res.status(providerPending || inventoryReconciliation ? 202 : 200).json({
      success: true,
      message: inventoryReconciliation
        ? 'Financial refund confirmed; inventory reconciliation is required'
        : providerPending
          ? 'Refund is awaiting payment-provider confirmation'
          : 'Refund processed successfully',
      data: returnItem
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Reconcile inventory after a financially confirmed refund
// @route   POST /api/returns/:id/inventory-reconciliation
// @access  Private/Admin
exports.reconcileReturnInventory = async (req, res, next) => {
  try {
    const result = await ReturnService.reconcileInventory({
      returnId: req.params.id,
      adminId: req.user.id,
      action: req.body.action,
      note: req.body.note || ''
    });

    await logActivity(
      req,
      'RETURN_INVENTORY_RECONCILIATION',
      `Inventory reconciliation for return ${result.return.returnNumber}: ${result.inventoryStatus}`,
      {
        returnId: result.return._id,
        refundId: result.refund._id,
        action: req.body.action,
        inventoryStatus: result.inventoryStatus,
        idempotentReplay: result.idempotentReplay
      }
    );

    return res.json({
      success: true,
      message: result.inventoryStatus === 'restored'
        ? 'Return inventory restored successfully'
        : 'Manual inventory resolution recorded successfully',
      data: {
        return: result.return,
        refund: result.refund,
        inventoryStatus: result.inventoryStatus,
        idempotentReplay: result.idempotentReplay
      }
    });
  } catch (error) {
    return next(error);
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

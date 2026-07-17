const Refund = require('../models/Refund');
const { logActivity } = require('../middleware/activityLogger');

// @desc    Get all refunds
// @route   GET /api/refunds
// @access  Private/Admin
exports.getRefunds = async (req, res) => {
  try {
    const { page = 1, limit = 15, status = '', search = '', startDate = '', endDate = '' } = req.query;
    let query = {};

    if (status && status !== 'all') query.status = status;
    
    if (search) {
      query.$or = [
        { refundNumber: { $regex: search, $options: 'i' } },
        { 'customer.fullName': { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const total = await Refund.countDocuments(query);
    const pages = Math.ceil(total / limit) || 1;

    const refunds = await Refund.find(query)
      .populate('customer', 'fullName email phone')
      .populate('returnId', 'returnNumber')
      .populate('orderId', 'orderId')
      .populate('processedBy', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: refunds,
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
    console.error('Get refunds error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single refund
// @route   GET /api/refunds/:id
// @access  Private/Admin
exports.getRefund = async (req, res) => {
  try {
    const refund = await Refund.findById(req.params.id)
      .populate('customer', 'fullName email phone')
      .populate('returnId')
      .populate('orderId')
      .populate('processedBy', 'fullName');

    if (!refund) {
      return res.status(404).json({ success: false, message: 'Refund not found' });
    }

    res.json({ success: true, data: refund });
  } catch (error) {
    console.error('Get refund error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create refund record (Triggered when return is approved)
// @route   POST /api/refunds
// @access  Private/Admin
exports.createRefund = async (req, res) => {
  try {
    const { returnId, orderId, customer, amount, method, notes } = req.body;

    const refund = await Refund.create({
      returnId,
      orderId,
      customer,
      amount,
      method,
      notes: notes || 'Refund initiated for approved return'
    });

    await logActivity(req, 'REFUND_CREATE', `Created refund record ${refund.refundNumber} for Rs. ${amount}`, { refundId: refund._id });

    res.status(201).json({ success: true, message: 'Refund record created', data: refund });
  } catch (error) {
    console.error('Create refund error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update refund status (Process/Complete/Failed)
// @route   PUT /api/refunds/:id
// @access  Private/Admin
exports.updateRefundStatus = async (req, res) => {
  try {
    const { status, transactionId, notes, failureReason } = req.body;
    const refund = await Refund.findById(req.params.id);

    if (!refund) {
      return res.status(404).json({ success: false, message: 'Refund not found' });
    }

    refund.status = status;
    if (transactionId) refund.transactionId = transactionId;
    if (notes) refund.notes = notes;
    if (failureReason) refund.failureReason = failureReason;
    
    if (status === 'completed' || status === 'failed') {
      refund.processedBy = req.user.id;
    }

    await refund.save();

    await logActivity(req, 'REFUND_UPDATE', `Updated refund ${refund.refundNumber} status to ${status}`, { refundId: refund._id, newStatus: status });

    res.json({ success: true, message: 'Refund status updated successfully', data: refund });
  } catch (error) {
    console.error('Update refund error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get refund statistics
// @route   GET /api/refunds/stats
// @access  Private/Admin
exports.getRefundStats = async (req, res) => {
  try {
    const totalRefunds = await Refund.countDocuments();
    const pendingRefunds = await Refund.countDocuments({ status: 'pending' });
    const processingRefunds = await Refund.countDocuments({ status: 'processing' });
    const completedRefunds = await Refund.countDocuments({ status: 'completed' });
    const failedRefunds = await Refund.countDocuments({ status: 'failed' });

    const totalRefundedAmount = await Refund.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const methodBreakdown = await Refund.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$method', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      data: {
        totalRefunds,
        pendingRefunds,
        processingRefunds,
        completedRefunds,
        failedRefunds,
        totalRefundedAmount: totalRefundedAmount[0]?.total || 0,
        methodBreakdown
      }
    });
  } catch (error) {
    console.error('Refund stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
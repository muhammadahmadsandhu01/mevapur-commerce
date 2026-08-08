const Refund = require('../models/Refund');
const RefundService = require('../services/payment/RefundService');
const { REFUND_STATUSES } = require('../constants/paymentConstants');

exports.getRefunds = async (req, res, next) => {
  try {
    const result = await RefundService.listRefunds(req.query);
    return res.json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getRefund = async (req, res, next) => {
  try {
    const refund = await RefundService.getRefund(req.params.id);
    return res.json({
      success: true,
      data: { refund },
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getRefundStats = async (_req, res, next) => {
  try {
    const [
      totalRefunds,
      pendingRefunds,
      processingRefunds,
      completedRefunds,
      failedRefunds,
      totals
    ] = await Promise.all([
      Refund.countDocuments(),
      Refund.countDocuments({ status: REFUND_STATUSES.PENDING }),
      Refund.countDocuments({ status: REFUND_STATUSES.PROCESSING }),
      Refund.countDocuments({ status: REFUND_STATUSES.COMPLETED }),
      Refund.countDocuments({ status: REFUND_STATUSES.FAILED }),
      Refund.aggregate([
        { $match: { status: REFUND_STATUSES.COMPLETED } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    return res.json({
      success: true,
      data: {
        totalRefunds,
        pendingRefunds,
        processingRefunds,
        completedRefunds,
        failedRefunds,
        totalRefundedAmount: totals[0]?.total || 0
      }
    });
  } catch (error) {
    return next(error);
  }
};

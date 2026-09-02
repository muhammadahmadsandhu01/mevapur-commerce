const Review = require('../models/Review');
const ReviewReport = require('../models/ReviewReport');
const ReviewService = require('../services/ReviewService');
const { logActivity } = require('../middleware/activityLogger');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Get all reviews (admin)
// @route   GET /api/reviews
// @access  Private (support, manager, admin, super_admin)
exports.getReviews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      status,
      isApproved,
      isFlagged,
      rating,
      search = ''
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    } else {
      if (isApproved !== undefined) query.isApproved = isApproved === 'true';
      if (isFlagged !== undefined) query.isFlagged = isFlagged === 'true';
    }

    if (rating && rating !== 'all') {
      query.rating = parseInt(rating, 10);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { comment: { $regex: sanitized, $options: 'i' } },
        { title: { $regex: sanitized, $options: 'i' } }
      ];
    }

    const total = await Review.countDocuments(query);
    const pages = Math.ceil(total / limitNum) || 1;

    const reviews = await Review.find(query)
      .populate('product', 'name slug images')
      .populate('user', 'fullName email')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      data: reviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages,
        hasNext: pageNum < pages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get review statistics (global)
// @route   GET /api/reviews/stats
// @access  Private (support, manager, admin, super_admin)
exports.getReviewStats = async (req, res) => {
  try {
    const total = await Review.countDocuments();
    const approved = await Review.countDocuments({ status: 'approved' });
    const pending = await Review.countDocuments({ status: 'pending' });
    const rejected = await Review.countDocuments({ status: 'rejected' });
    const flagged = await Review.countDocuments({ status: 'flagged' });
    const withdrawn = await Review.countDocuments({ status: 'withdrawn' });

    // Average rating of approved reviews only
    const avgRating = await Review.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);

    res.json({
      success: true,
      data: {
        total,
        approved,
        pending,
        rejected,
        flagged,
        withdrawn,
        averageRating: avgRating[0]?.avg ? (Math.round(avgRating[0].avg * 10) / 10).toFixed(1) : '0'
      }
    });
  } catch (error) {
    console.error('Review stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Approve review
// @route   PATCH /api/reviews/:id/approve
// @access  Private (manager, admin, super_admin)
exports.approveReview = async (req, res) => {
  try {
    const review = await ReviewService.transitionModerationState({
      reviewId: req.params.id,
      nextStatus: 'approved',
      moderatorId: req.user.id
    });

    await logActivity(req, 'REVIEW_APPROVE', 'Approved review', {
      reviewId: review._id,
      productId: review.product,
      rating: review.rating
    });

    res.json({
      success: true,
      message: 'Review approved successfully',
      data: review
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};

// @desc    Reject review
// @route   PATCH /api/reviews/:id/reject
// @access  Private (manager, admin, super_admin)
exports.rejectReview = async (req, res) => {
  try {
    const { reason = '' } = req.body;
    const review = await ReviewService.transitionModerationState({
      reviewId: req.params.id,
      nextStatus: 'rejected',
      moderatorId: req.user.id,
      reason
    });

    await logActivity(req, 'REVIEW_REJECT', 'Rejected review', {
      reviewId: review._id,
      productId: review.product,
      reason
    });

    res.json({
      success: true,
      message: 'Review rejected successfully',
      data: review
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};

// @desc    Flag review
// @route   PATCH /api/reviews/:id/flag
// @access  Private (manager, admin, super_admin)
exports.flagReview = async (req, res) => {
  try {
    const { reason = '' } = req.body;
    const review = await ReviewService.transitionModerationState({
      reviewId: req.params.id,
      nextStatus: 'flagged',
      moderatorId: req.user.id,
      reason
    });

    await logActivity(req, 'REVIEW_FLAG', 'Flagged review', {
      reviewId: review._id,
      productId: review.product,
      reason
    });

    res.json({
      success: true,
      message: 'Review flagged successfully',
      data: review
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};

// @desc    Reply to review
// @route   PATCH /api/reviews/:id/reply
// @access  Private (manager, admin, super_admin)
exports.replyReview = async (req, res) => {
  try {
    const { reply } = req.body;
    const review = await ReviewService.replyToReview({
      reviewId: req.params.id,
      reply,
      moderatorId: req.user.id
    });

    await logActivity(req, 'REVIEW_REPLY', 'Replied to review', {
      reviewId: review._id,
      productId: review.product
    });

    res.json({
      success: true,
      message: 'Reply submitted successfully',
      data: review
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};

// @desc    Customer report review
// @route   POST /api/reviews/:id/reports
// @access  Private (customer)
exports.reportReview = async (req, res) => {
  try {
    const { category, reason, details } = req.body;
    const reportCategory = category || (reason ? 'other' : 'inappropriate');
    const reportDetails = details || reason || '';

    const report = await ReviewService.reportReview({
      reviewId: req.params.id,
      reporterId: req.user.id,
      category: reportCategory,
      details: reportDetails
    });

    res.status(201).json({
      success: true,
      message: 'Review report submitted successfully',
      data: report
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};

// @desc    Resolve review report
// @route   PATCH /api/reviews/:id/reports/:reportId/resolve
// @access  Private (manager, admin, super_admin)
exports.resolveReport = async (req, res) => {
  try {
    const { action, resolutionNote = '' } = req.body;
    const report = await ReviewService.resolveReport({
      reportId: req.params.reportId,
      action,
      moderatorId: req.user.id,
      resolutionNote
    });

    res.json({
      success: true,
      message: 'Review report resolved successfully',
      data: report
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};

// @desc    Exceptional legal erasure (Hard delete)
// @route   DELETE /api/reviews/:id/exceptional-erase
// @access  Private (super_admin)
exports.exceptionalErase = async (req, res) => {
  try {
    const { legalReason } = req.body;
    await ReviewService.exceptionalErase({
      reviewId: req.params.id,
      moderatorId: req.user.id,
      legalReason: legalReason || 'Legal compliance request'
    });

    await logActivity(req, 'REVIEW_EXCEPTIONAL_ERASE', 'Exceptional legal erasure of review', {
      reviewId: req.params.id,
      legalReason
    });

    res.json({ success: true, message: 'Review erased permanently under legal protocol' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};

// @desc    Update review (Legacy compatibility endpoint)
// @route   PUT /api/reviews/:id
// @access  Private (manager, admin, super_admin)
exports.updateReview = async (req, res) => {
  try {
    const { isApproved, isFlagged, adminReply, status } = req.body;
    let review;

    if (adminReply !== undefined) {
      review = await ReviewService.replyToReview({
        reviewId: req.params.id,
        reply: adminReply,
        moderatorId: req.user.id
      });
    }

    if (status) {
      review = await ReviewService.transitionModerationState({
        reviewId: req.params.id,
        nextStatus: status,
        moderatorId: req.user.id
      });
    } else if (isApproved === true) {
      review = await ReviewService.transitionModerationState({
        reviewId: req.params.id,
        nextStatus: 'approved',
        moderatorId: req.user.id
      });
    } else if (isApproved === false && isFlagged !== true) {
      review = await ReviewService.transitionModerationState({
        reviewId: req.params.id,
        nextStatus: 'rejected',
        moderatorId: req.user.id
      });
    } else if (isFlagged === true) {
      review = await ReviewService.transitionModerationState({
        reviewId: req.params.id,
        nextStatus: 'flagged',
        moderatorId: req.user.id
      });
    } else if (!review) {
      review = await Review.findById(req.params.id);
    }

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: review
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};

// @desc    Delete review (Legacy compatibility -> Soft withdraw / Reject)
// @route   DELETE /api/reviews/:id
// @access  Private (admin, super_admin)
exports.deleteReview = async (req, res) => {
  try {
    if (req.user.role === 'super_admin' && req.query.hard === 'true') {
      await ReviewService.exceptionalErase({
        reviewId: req.params.id,
        moderatorId: req.user.id,
        legalReason: 'Admin requested hard delete'
      });
      return res.json({ success: true, message: 'Review deleted successfully' });
    }

    // Reversible rejection/moderation
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (review.status === 'approved') {
      await ReviewService.transitionModerationState({
        reviewId: req.params.id,
        nextStatus: 'rejected',
        moderatorId: req.user.id,
        reason: 'Removed by administrator'
      });
    } else if (review.status !== 'rejected') {
      review.status = 'rejected';
      await review.save();
    }

    await logActivity(req, 'REVIEW_DELETE', 'Deleted/Rejected review', {
      reviewId: req.params.id,
      productId: review.product
    });

    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message, code: error.code });
  }
};
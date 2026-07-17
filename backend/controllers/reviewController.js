const Review = require('../models/Review');
const Product = require('../models/Product');
const { logActivity } = require('../middleware/activityLogger');

// @desc    Get all reviews (admin)
// @route   GET /api/reviews
// @access  Private/Admin
exports.getReviews = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 15, 
      isApproved,
      isFlagged,
      rating,
      search = ''
    } = req.query;

    let query = {};

    // 🌟 Direct boolean filtering matching frontend
    if (isApproved !== undefined) query.isApproved = isApproved === 'true';
    if (isFlagged !== undefined) query.isFlagged = isFlagged === 'true';
    if (rating) query.rating = parseInt(rating, 10);

    if (search) {
      query.$or = [
        { comment: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Review.countDocuments(query);
    const pages = Math.ceil(total / limit) || 1;

    const reviews = await Review.find(query)
      .populate('product', 'name slug images')
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: reviews,
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
    console.error('Get reviews error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update review (Approve, Reject, Flag, or Reply)
// @route   PUT /api/reviews/:id
// @access  Private/Admin
exports.updateReview = async (req, res) => {
  try {
    const { isApproved, isFlagged, adminReply } = req.body;
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (isApproved !== undefined) review.isApproved = isApproved;
    if (isFlagged !== undefined) review.isFlagged = isFlagged;
    
    if (adminReply !== undefined) {
      review.adminReply = adminReply;
      review.repliedAt = Date.now();
    }

    await review.save();

    // Determine action for logging
    let action = 'REVIEW_UPDATE';
    let description = `Updated review`;
    if (isApproved === true) { action = 'REVIEW_APPROVE'; description = 'Approved review'; }
    else if (isApproved === false) { action = 'REVIEW_REJECT'; description = 'Rejected review'; }
    else if (isFlagged === true) { action = 'REVIEW_FLAG'; description = 'Flagged review'; }

    await logActivity(req, action, description, { 
      reviewId: review._id,
      productId: review.product,
      rating: review.rating
    });

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: review
    });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private/Admin
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await logActivity(req, 'REVIEW_DELETE', `Deleted review`, { 
      reviewId: review._id, 
      productId: review.product 
    });

    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get review statistics
// @route   GET /api/reviews/stats
// @access  Private/Admin
exports.getReviewStats = async (req, res) => {
  try {
    const total = await Review.countDocuments();
    const approved = await Review.countDocuments({ isApproved: true });
    const pending = await Review.countDocuments({ isApproved: false, isFlagged: false });
    const flagged = await Review.countDocuments({ isFlagged: true });

    // Average rating of approved reviews only
    const avgRating = await Review.aggregate([
      { $match: { isApproved: true } },
      { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);

    res.json({
      success: true,
      data: {
        total,
        approved,
        pending,
        flagged,
        averageRating: avgRating[0]?.avg ? avgRating[0].avg.toFixed(1) : '0'
      }
    });
  } catch (error) {
    console.error('Review stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Report review (public)
// @route   POST /api/reviews/:id/report
// @access  Public
exports.reportReview = async (req, res) => {
  try {
    const { reason } = req.body;
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    review.isFlagged = true;
    review.reportReason = reason || 'No reason provided';
    await review.save();

    res.json({ success: true, message: 'Review reported successfully' });
  } catch (error) {
    console.error('Report review error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
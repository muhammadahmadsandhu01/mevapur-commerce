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
      limit = 10, 
      status = '',
      rating = '',
      search = ''
    } = req.query;

    let query = {};

    if (status === 'approved') query.isApproved = true;
    else if (status === 'pending') query.isApproved = false;
    else if (status === 'reported') query.reported = true;

    if (rating) query.rating = parseInt(rating);

    if (search) {
      query.$or = [
        { comment: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Review.countDocuments(query);
    const pages = Math.ceil(total / limit);

    const reviews = await Review.find(query)
      .populate('product', 'name images')
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
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Approve/Reject review
// @route   PUT /api/reviews/:id/approve
// @access  Private/Admin
exports.approveReview = async (req, res) => {
  try {
    const { isApproved, adminReply } = req.body;

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.isApproved = isApproved;
    
    if (adminReply) {
      review.adminReply = adminReply;
      review.repliedAt = Date.now();
    }

    await review.save();

    const action = isApproved ? 'REVIEW_APPROVE' : 'REVIEW_REJECT';
    const description = isApproved 
      ? `Approved review on product` 
      : `Rejected review on product`;
    
    await logActivity(req, action, description, { 
      reviewId: review._id,
      productId: review.product,
      rating: review.rating,
      adminReply: adminReply
    });

    res.json({
      success: true,
      message: isApproved ? 'Review approved' : 'Review rejected',
      data: review
    });
  } catch (error) {
    console.error('Approve review error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private/Admin
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    await logActivity(req, 'REVIEW_DELETE', 
      `Deleted review`, 
      { reviewId: review._id, productId: review.product }
    );

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get review statistics
// @route   GET /api/reviews/stats
// @access  Private/Admin
exports.getReviewStats = async (req, res) => {
  try {
    const totalReviews = await Review.countDocuments();
    const approvedReviews = await Review.countDocuments({ isApproved: true });
    const pendingReviews = await Review.countDocuments({ isApproved: false });
    const reportedReviews = await Review.countDocuments({ reported: true });

    // Average rating
    const avgRating = await Review.aggregate([
      { $match: { isApproved: true } },
      { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);

    res.json({
      success: true,
      data: {
        totalReviews,
        approvedReviews,
        pendingReviews,
        reportedReviews,
        averageRating: avgRating[0]?.avg?.toFixed(1) || 0
      }
    });
  } catch (error) {
    console.error('Review stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.reported = true;
    review.reportReason = reason;
    await review.save();

    res.json({
      success: true,
      message: 'Review reported successfully'
    });
  } catch (error) {
    console.error('Report review error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
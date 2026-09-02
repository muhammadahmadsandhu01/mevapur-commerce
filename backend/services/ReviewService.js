const mongoose = require('mongoose');
const Review = require('../models/Review');
const ReviewReport = require('../models/ReviewReport');
const Product = require('../models/Product');
const Order = require('../models/Order');
const AuditService = require('./AuditService');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

const VALID_MODERATION_TRANSITIONS = {
  pending: ['approved', 'rejected', 'flagged'],
  approved: ['rejected', 'flagged'],
  rejected: ['approved', 'flagged'],
  flagged: ['approved', 'rejected'],
  withdrawn: []
};

class ReviewService {
  /**
   * Helper to execute a callback inside a MongoDB transaction with bounded transient retry
   */
  async withTransaction(callback) {
    const isTestEnv = process.env.NODE_ENV === 'test';
    const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

    let session;
    try {
      session = await mongoose.startSession();
    } catch (sessionErr) {
      if (isProdOrStaging) {
        throw new AppError(
          'Database transactions are required but unavailable in production/staging',
          500,
          ERROR_CODES.INTERNAL_SERVER_ERROR || 'TRANSACTIONS_UNAVAILABLE'
        );
      }
      // In single-node standalone dev/test without replica set, execute callback directly
      return await callback(null);
    }

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback(session);
        });
        return result;
      } catch (error) {
        const isTransient = error.hasErrorLabel && (
          error.hasErrorLabel('TransientTransactionError') ||
          error.hasErrorLabel('UnknownTransactionCommitResult')
        );

        if (isTransient && attempt < maxRetries) {
          const jitter = Math.floor(Math.random() * 50) + 20 * attempt;
          await new Promise((resolve) => setTimeout(resolve, jitter));
          continue;
        }

        // If transactions aren't supported on local standalone mongodb and we're in dev/test
        if (
          !isProdOrStaging &&
          (error.message?.includes('replica set') || error.message?.includes('standalone'))
        ) {
          await session.endSession();
          return await callback(null);
        }

        throw error;
      } finally {
        if (attempt >= maxRetries || !session.inTransaction()) {
          await session.endSession();
        }
      }
    }
  }

  /**
   * Authoritative rating and review-count projection calculation
   */
  async recalculateProductRating(productId, session = null) {
    const matchQuery = {
      product: new mongoose.Types.ObjectId(String(productId)),
      status: 'approved'
    };

    const aggregatePromise = Review.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$product',
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' }
        }
      }
    ]);

    if (session) {
      aggregatePromise.session(session);
    }

    const stats = await aggregatePromise;
    const count = stats[0]?.count || 0;
    const avg = stats[0]?.avgRating || 0;
    const rating = count > 0 ? Math.round((avg + Number.EPSILON) * 10) / 10 : 0;

    const updateQuery = Product.findByIdAndUpdate(
      productId,
      { rating, reviewCount: count },
      { new: true, runValidators: true }
    );

    if (session) {
      updateQuery.session(session);
    }

    await updateQuery;
    return { rating, reviewCount: count };
  }

  /**
   * Submit customer review (Requires verified delivered purchase)
   */
  async submitReview({ userId, productId, rating, title = '', comment }) {
    if (!rating || rating < 1 || rating > 5) {
      throw new AppError('Rating must be an integer between 1 and 5', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
    }
    if (!comment || typeof comment !== 'string' || !comment.trim()) {
      throw new AppError('Review comment is required', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
    }

    // Authoritative delivered purchase check
    const deliveredOrder = await Order.exists({
      user: userId,
      orderStatus: 'Delivered',
      'items.product': productId
    });

    if (!deliveredOrder) {
      throw new AppError(
        'A delivered purchase is required to review this product',
        403,
        ERROR_CODES.CUSTOMER_REVIEW_NOT_ELIGIBLE
      );
    }

    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) {
      throw new AppError('Product is unavailable', 404, ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE);
    }

    return await this.withTransaction(async (session) => {
      try {
        const createOptions = session ? { session } : {};
        const [review] = await Review.create([{
          product: productId,
          user: userId,
          rating: parseInt(rating, 10),
          title: String(title).slice(0, 100).trim(),
          comment: String(comment).slice(0, 1000).trim(),
          status: 'pending',
          isVerifiedPurchase: true,
          isApproved: false,
          isFlagged: false
        }], createOptions);

        await AuditService.log({
          eventName: 'REVIEW.SUBMITTED',
          userId,
          status: 'SUCCESS',
          metadata: {
            reviewId: String(review._id),
            productId: String(productId),
            rating: review.rating
          }
        }, session);

        return review;
      } catch (error) {
        if (error.code === 11000) {
          throw new AppError('You have already reviewed this product', 409, ERROR_CODES.CUSTOMER_REVIEW_EXISTS);
        }
        throw error;
      }
    });
  }

  /**
   * Customer edits their own review
   */
  async updateCustomerReview({ userId, reviewId, rating, title, comment }) {
    return await this.withTransaction(async (session) => {
      const query = Review.findOne({ _id: reviewId, user: userId });
      if (session) query.session(session);

      const review = await query;
      if (!review) {
        throw new AppError('Review not found', 404, ERROR_CODES.CUSTOMER_REVIEW_NOT_FOUND);
      }

      if (review.status === 'withdrawn') {
        throw new AppError('Withdrawn reviews cannot be edited', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
      }

      const wasApproved = review.status === 'approved';

      if (rating !== undefined) {
        if (rating < 1 || rating > 5) {
          throw new AppError('Rating must be between 1 and 5', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
        }
        review.rating = parseInt(rating, 10);
      }
      if (title !== undefined) review.title = String(title).slice(0, 100).trim();
      if (comment !== undefined) {
        if (!comment.trim()) {
          throw new AppError('Comment cannot be empty', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
        }
        review.comment = String(comment).slice(0, 1000).trim();
      }

      // Customer edits always reset status to pending for re-moderation
      review.status = 'pending';
      await review.save({ session });

      // If review was previously approved, recalculate product rating since it's now pending
      if (wasApproved) {
        await this.recalculateProductRating(review.product, session);
      }

      await AuditService.log({
        eventName: 'REVIEW.EDITED',
        userId,
        status: 'SUCCESS',
        metadata: {
          reviewId: String(review._id),
          productId: String(review.product),
          status: review.status
        }
      }, session);

      return review;
    });
  }

  /**
   * Customer withdraws/deletes their own review (Reversible soft withdrawal)
   */
  async withdrawCustomerReview({ userId, reviewId }) {
    return await this.withTransaction(async (session) => {
      const query = Review.findOne({ _id: reviewId, user: userId });
      if (session) query.session(session);

      const review = await query;
      if (!review) {
        throw new AppError('Review not found', 404, ERROR_CODES.CUSTOMER_REVIEW_NOT_FOUND);
      }

      const wasApproved = review.status === 'approved';
      review.status = 'withdrawn';
      await review.save({ session });

      if (wasApproved) {
        await this.recalculateProductRating(review.product, session);
      }

      await AuditService.log({
        eventName: 'REVIEW.WITHDRAWN',
        userId,
        status: 'SUCCESS',
        metadata: {
          reviewId: String(review._id),
          productId: String(review.product)
        }
      }, session);

      return review;
    });
  }

  /**
   * Moderator transitions review status (approve, reject, flag)
   */
  async transitionModerationState({ reviewId, nextStatus, moderatorId, reason = '' }) {
    return await this.withTransaction(async (session) => {
      const query = Review.findById(reviewId);
      if (session) query.session(session);

      const review = await query;
      if (!review) {
        throw new AppError('Review not found', 404, ERROR_CODES.REVIEW_NOT_FOUND || 'REVIEW_NOT_FOUND');
      }

      const allowedTransitions = VALID_MODERATION_TRANSITIONS[review.status] || [];
      if (!allowedTransitions.includes(nextStatus)) {
        throw new AppError(
          `Cannot transition review from '${review.status}' to '${nextStatus}'`,
          400,
          ERROR_CODES.INVALID_STATE_TRANSITION || 'INVALID_STATE_TRANSITION'
        );
      }

      const previousStatus = review.status;
      review.status = nextStatus;
      if (reason) {
        review.reportReason = String(reason).slice(0, 500).trim();
      }

      await review.save({ session });

      // If status changed to or from approved, recalculate product rating
      if (previousStatus === 'approved' || nextStatus === 'approved') {
        await this.recalculateProductRating(review.product, session);
      }

      await AuditService.log({
        eventName: `REVIEW.${nextStatus.toUpperCase()}`,
        userId: moderatorId,
        status: 'SUCCESS',
        metadata: {
          reviewId: String(review._id),
          productId: String(review.product),
          fromStatus: previousStatus,
          toStatus: nextStatus,
          reason
        }
      }, session);

      return review;
    });
  }

  /**
   * Moderator adds/updates admin reply to a review
   */
  async replyToReview({ reviewId, reply, moderatorId }) {
    if (!reply || typeof reply !== 'string' || !reply.trim()) {
      throw new AppError('Reply text is required', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
    }

    return await this.withTransaction(async (session) => {
      const query = Review.findById(reviewId);
      if (session) query.session(session);

      const review = await query;
      if (!review) {
        throw new AppError('Review not found', 404, ERROR_CODES.REVIEW_NOT_FOUND || 'REVIEW_NOT_FOUND');
      }

      review.adminReply = String(reply).slice(0, 1000).trim();
      review.repliedAt = new Date();
      await review.save({ session });

      await AuditService.log({
        eventName: 'REVIEW.REPLIED',
        userId: moderatorId,
        status: 'SUCCESS',
        metadata: {
          reviewId: String(review._id),
          productId: String(review.product)
        }
      }, session);

      return review;
    });
  }

  /**
   * SuperAdmin exceptional legal hard erasure
   */
  async exceptionalErase({ reviewId, moderatorId, legalReason }) {
    if (!legalReason || typeof legalReason !== 'string' || !legalReason.trim()) {
      throw new AppError('A valid legal erasure reason is required', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
    }

    return await this.withTransaction(async (session) => {
      const query = Review.findById(reviewId);
      if (session) query.session(session);

      const review = await query;
      if (!review) {
        throw new AppError('Review not found', 404, ERROR_CODES.REVIEW_NOT_FOUND || 'REVIEW_NOT_FOUND');
      }

      const productId = review.product;
      const wasApproved = review.status === 'approved';

      const deleteReviewQuery = Review.findByIdAndDelete(reviewId);
      const deleteReportsQuery = ReviewReport.deleteMany({ review: reviewId });
      if (session) {
        deleteReviewQuery.session(session);
        deleteReportsQuery.session(session);
      }

      await Promise.all([deleteReviewQuery, deleteReportsQuery]);

      if (wasApproved) {
        await this.recalculateProductRating(productId, session);
      }

      await AuditService.log({
        eventName: 'REVIEW.EXCEPTIONAL_ERASED',
        userId: moderatorId,
        status: 'SUCCESS',
        metadata: {
          reviewId: String(reviewId),
          productId: String(productId),
          legalReason: String(legalReason).slice(0, 500).trim()
        }
      }, session);

      return { success: true };
    });
  }

  /**
   * Customer files a report against a review (Does not auto-hide review)
   */
  async reportReview({ reviewId, reporterId, category, details = '' }) {
    const validCategories = ['inappropriate', 'spam', 'misleading', 'harassment', 'other'];
    if (!validCategories.includes(category)) {
      throw new AppError('Invalid report category', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      throw new AppError('Review not found', 404, ERROR_CODES.REVIEW_NOT_FOUND || 'REVIEW_NOT_FOUND');
    }

    // Check if an active pending report already exists from this reporter
    const existingActiveReport = await ReviewReport.findOne({
      review: reviewId,
      reporter: reporterId,
      status: 'pending'
    });

    if (existingActiveReport) {
      throw new AppError('You have already submitted a pending report for this review', 409, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
    }

    const report = await ReviewReport.create({
      review: reviewId,
      reporter: reporterId,
      category,
      details: String(details).slice(0, 500).trim(),
      status: 'pending'
    });

    await AuditService.log({
      eventName: 'REVIEW.REPORTED',
      userId: reporterId,
      status: 'SUCCESS',
      metadata: {
        reportId: String(report._id),
        reviewId: String(reviewId),
        category
      }
    });

    return report;
  }

  /**
   * Moderator resolves a review report
   */
  async resolveReport({ reportId, action, moderatorId, resolutionNote = '' }) {
    if (!['approve_report', 'dismiss_report'].includes(action)) {
      throw new AppError('Action must be approve_report or dismiss_report', 400, ERROR_CODES.CUSTOMER_VALIDATION_FAILED);
    }

    return await this.withTransaction(async (session) => {
      const reportQuery = ReviewReport.findById(reportId);
      if (session) reportQuery.session(session);

      const report = await reportQuery;
      if (!report) {
        throw new AppError('Report not found', 404, ERROR_CODES.NOT_FOUND || 'REPORT_NOT_FOUND');
      }

      if (report.status !== 'pending') {
        throw new AppError('Report has already been resolved', 400, ERROR_CODES.INVALID_STATE_TRANSITION || 'REPORT_ALREADY_RESOLVED');
      }

      const reviewQuery = Review.findById(report.review);
      if (session) reviewQuery.session(session);
      const review = await reviewQuery;

      if (action === 'approve_report') {
        report.status = 'resolved_valid';
        if (review && review.status !== 'flagged') {
          const wasApproved = review.status === 'approved';
          review.status = 'flagged';
          review.reportReason = report.details || report.category;
          await review.save({ session });

          if (wasApproved) {
            await this.recalculateProductRating(review.product, session);
          }
        }
      } else {
        report.status = 'resolved_dismissed';
      }

      report.resolvedBy = moderatorId;
      report.resolvedAt = new Date();
      report.resolutionNote = String(resolutionNote).slice(0, 500).trim();
      await report.save({ session });

      await AuditService.log({
        eventName: 'REVIEW.REPORT_RESOLVED',
        userId: moderatorId,
        status: 'SUCCESS',
        metadata: {
          reportId: String(report._id),
          reviewId: String(report.review),
          action,
          resolutionNote
        }
      }, session);

      return report;
    });
  }

  /**
   * Public list of approved reviews for a product
   */
  async listPublicReviews(productId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {
      product: productId,
      $or: [
        { status: 'approved' },
        { isApproved: true, status: { $nin: ['rejected', 'flagged', 'withdrawn'] } }
      ]
    };

    if (query.rating) {
      filter.rating = parseInt(query.rating, 10);
    }

    const [items, total, summary] = await Promise.all([
      Review.find(filter)
        .populate('user', 'fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
      Review.aggregate([
        {
          $match: {
            product: new mongoose.Types.ObjectId(String(productId)),
            $or: [
              { status: 'approved' },
              { isApproved: true, status: { $nin: ['rejected', 'flagged', 'withdrawn'] } }
            ]
          }
        },
        { $group: { _id: null, averageRating: { $avg: '$rating' }, count: { $sum: 1 } } }
      ])
    ]);

    return {
      reviews: items.map((item) => ({
        id: String(item._id),
        rating: item.rating,
        title: item.title,
        comment: item.comment,
        isVerifiedPurchase: item.isVerifiedPurchase,
        createdAt: item.createdAt,
        user: { fullName: item.user?.fullName || 'Customer' },
        adminReply: item.adminReply || ''
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      summary: {
        count: summary[0]?.count || 0,
        averageRating: summary[0]?.averageRating ? Math.round(summary[0].averageRating * 10) / 10 : 0
      }
    };
  }
}

module.exports = new ReviewService();

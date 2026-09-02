const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    maxlength: 100,
    default: '',
    trim: true
  },
  comment: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged', 'withdrawn'],
    default: 'pending',
    required: true,
    index: true
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  isFlagged: {
    type: Boolean,
    default: false
  },
  reportReason: {
    type: String,
    default: '',
    maxlength: 500
  },
  adminReply: {
    type: String,
    default: '',
    maxlength: 1000,
    trim: true
  },
  repliedAt: {
    type: Date,
    default: null
  },
  helpfulCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Dual-write & compatibility pre-validate hook
reviewSchema.pre('validate', function(next) {
  // If status is present, synchronize legacy booleans
  if (this.status) {
    this.isApproved = (this.status === 'approved');
    this.isFlagged = (this.status === 'flagged');
  } else {
    // If status is absent on legacy documents, derive status from legacy booleans
    if (this.isFlagged) {
      this.status = 'flagged';
    } else if (this.isApproved) {
      this.status = 'approved';
    } else {
      this.status = 'pending';
    }
  }
  next();
});

// Prevent duplicate reviews from same user on same product (1 review per customer/product)
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// Composite indexes for lightning-fast public and moderation queries
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ isApproved: 1, createdAt: -1 });
reviewSchema.index({ isFlagged: 1 });
reviewSchema.index({ rating: 1 });

module.exports = mongoose.model('Review', reviewSchema);
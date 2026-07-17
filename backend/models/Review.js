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
    default: ''
  },
  comment: {
    type: String,
    required: true,
    maxlength: 1000
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  isFlagged: { // 🌟 ADDED: Matches frontend admin panel exactly
    type: Boolean,
    default: false
  },
  reportReason: {
    type: String,
    default: ''
  },
  adminReply: {
    type: String,
    default: ''
  },
  repliedAt: {
    type: Date
  },
  helpfulCount: { // 🌟 ADDED: For "X people found this helpful"
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Prevent duplicate reviews from same user on same product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// 🌟 Indexes for lightning-fast admin filtering
reviewSchema.index({ isApproved: 1, createdAt: -1 });
reviewSchema.index({ isFlagged: 1 });
reviewSchema.index({ rating: 1 });

module.exports = mongoose.model('Review', reviewSchema);
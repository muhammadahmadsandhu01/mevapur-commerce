const mongoose = require('mongoose');

const reviewReportSchema = new mongoose.Schema({
  review: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review',
    required: true,
    index: true
  },
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['inappropriate', 'spam', 'misleading', 'harassment', 'other'],
    required: true
  },
  details: {
    type: String,
    maxlength: 500,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'resolved_valid', 'resolved_dismissed'],
    default: 'pending',
    required: true,
    index: true
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolutionNote: {
    type: String,
    maxlength: 500,
    default: '',
    trim: true
  }
}, {
  timestamps: true
});

// Unique partial index preventing duplicate active/pending reports by same reporter on same review
reviewReportSchema.index(
  { review: 1, reporter: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'unique_active_review_report'
  }
);

reviewReportSchema.index({ status: 1, createdAt: -1 });
reviewReportSchema.index({ review: 1, status: 1 });

module.exports = mongoose.model('ReviewReport', reviewReportSchema);

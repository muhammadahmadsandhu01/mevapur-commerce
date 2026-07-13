const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['banner', 'slider', 'page', 'blog'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  subtitle: {
    type: String,
    maxlength: 300
  },
  description: {
    type: String,
    maxlength: 1000
  },
  content: {
    type: String,
    maxlength: 50000
  },
  image: {
    type: String,
    default: ''
  },
  images: [{
    url: String,
    alt: String,
    link: String
  }],
  button: {
    text: String,
    link: String
  },
  position: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    default: ''
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: String
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better performance
contentSchema.index({ type: 1, isActive: 1, position: 1 });
contentSchema.index({ slug: 1 });
contentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Content', contentSchema);
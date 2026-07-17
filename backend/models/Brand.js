const mongoose = require('mongoose');
const slugify = require('slugify');

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  logo: { type: String, default: '' },
  banner: { type: String, default: '' },
  description: { type: String, default: '' },
  countryOfOrigin: { type: String, default: '' },
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  
  seo: {
    metaTitle: { type: String },
    metaDescription: { type: String }
  }
}, { timestamps: true });

// 🌟 AUTO-GENERATE SLUG BEFORE SAVING
brandSchema.pre('save', function(next) {
  if ((this.isNew || this.isModified('name')) && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
  }
  next();
});

brandSchema.index({ slug: 1 });

module.exports = mongoose.model('Brand', brandSchema);
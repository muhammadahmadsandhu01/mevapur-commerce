const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, default: '' },
  image: { type: String, default: '' },
  icon: { type: String, default: '' }, 
  
  // Hierarchy: parentId null = Main Category, else Subcategory
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false }, // 🌟 ADDED: For homepage display
  displayOrder: { type: Number, default: 0 },

  seo: {
    metaTitle: { type: String },
    metaDescription: { type: String }
  }
}, { timestamps: true });

// 🌟 AUTO-GENERATE SLUG BEFORE SAVING
categorySchema.pre('save', function(next) {
  if ((this.isNew || this.isModified('name')) && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
  }
  next();
});

categorySchema.index({ slug: 1 });
categorySchema.index({ parentId: 1, isActive: 1 });

module.exports = mongoose.model('Category', categorySchema);
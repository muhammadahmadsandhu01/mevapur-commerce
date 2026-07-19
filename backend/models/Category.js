const mongoose = require('mongoose');
const slugify = require('slugify');

// Guard Clause: Prevent OverwriteModelError
if (mongoose.models.Category) {
  module.exports = mongoose.models.Category;
} else {
  const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    // unique: true automatically creates an index, so no need for separate .index({ slug: 1 })
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    icon: { type: String, default: '' },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    seo: {
      metaTitle: { type: String },
      metaDescription: { type: String }
    }
  }, { timestamps: true });

  categorySchema.pre('save', function(next) {
    if ((this.isNew || this.isModified('name')) && !this.slug) {
      this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
    }
    next();
  });

  // Only keep composite index, removed duplicate slug index
  categorySchema.index({ parentId: 1, isActive: 1 });

  module.exports = mongoose.model('Category', categorySchema);
}
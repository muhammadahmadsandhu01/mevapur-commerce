const mongoose = require('mongoose');
const slugify = require('slugify');

// Guard Clause: Prevent OverwriteModelError
if (mongoose.models.Product) {
  module.exports = mongoose.models.Product;
} else {
  const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    // unique: true creates index automatically
    slug: { type: String, required: true, unique: true, lowercase: true },
    shortDescription: { type: String, default: '' },
    description: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    price: { type: Number, required: true, default: 0 },
    originalPrice: { type: Number, default: 0 },
    stock: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    discount: { type: Number, default: 0 },
    attributes: [{ name: { type: String, trim: true }, value: { type: String, trim: true } }],
    variants: [{
      sku: { type: String, required: true },
      barcode: { type: String, default: '' },
      attributes: [{ name: String, value: String }],
      price: { type: Number, required: true },
      salePrice: { type: Number, default: 0 },
      stock: { type: Number, required: true, default: 0 },
      images: [{ type: String }],
      isDefault: { type: Boolean, default: false }
    }],
    image: { type: String, default: '' },
    images: [{ type: String }],
    primaryImage: { type: String, default: '' },
    gallery: [{ type: String }],
    videoUrl: { type: String, default: '' },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    seo: { metaTitle: { type: String }, metaDescription: { type: String }, keywords: { type: String } }
  }, { timestamps: true });

  productSchema.pre('save', function(next) {
    if ((this.isNew || this.isModified('name')) && !this.slug) {
      this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
    }
    if (this.variants && this.variants.length > 0) {
      const defaultVariant = this.variants.find(v => v.isDefault) || this.variants[0];
      this.price = defaultVariant.price;
      this.originalPrice = defaultVariant.salePrice > 0 ? defaultVariant.salePrice : defaultVariant.price;
      this.stock = defaultVariant.stock;
      if (defaultVariant.images && defaultVariant.images.length > 0) {
        this.primaryImage = defaultVariant.images[0];
        this.images = defaultVariant.images;
      }
      this.variants.forEach((v, index) => { v.isDefault = (index === 0); });
    }
    next();
  });

  // Removed duplicate slug index. Kept essential functional indexes.
  productSchema.index({ name: 'text', description: 'text' });
  productSchema.index({ category: 1, subcategory: 1, brand: 1 });
  productSchema.index({ price: 1, rating: -1, isFeatured: -1 });
  productSchema.index({ isActive: 1 });

  module.exports = mongoose.model('Product', productSchema);
}
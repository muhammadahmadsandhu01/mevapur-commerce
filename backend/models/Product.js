const mongoose = require('mongoose');
const slugify = require('slugify'); // Ensure 'slugify' is installed: npm install slugify

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  shortDescription: { type: String, default: '' },
  description: { type: String, required: true },

  // 🔗 Relationships (Optional initially for backward compatibility)
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

  // 💰 Backward Compatibility: Root level pricing (Used by existing ProductCard)
  price: { type: Number, required: true, default: 0 },
  originalPrice: { type: Number, default: 0 },
  stock: { type: Number, required: true, default: 0 },
  discount: { type: Number, default: 0 },

  // 🌟 NEW: Dynamic Attributes (No schema change needed for new filters!)
  // Example: [{ name: "Weight", value: "1kg" }, { name: "Organic", value: "Yes" }]
  attributes: [{
    name: { type: String, trim: true },
    value: { type: String, trim: true }
  }],

  // 🌟 NEW: Product Variants (For Weight, Packaging, Flavor, etc.)
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

  // 🖼️ Media
  image: { type: String, default: '' }, // Legacy support
  images: [{ type: String }],           // Legacy support
  primaryImage: { type: String, default: '' },
  gallery: [{ type: String }],
  videoUrl: { type: String, default: '' },

  // 📊 Analytics & Status
  rating: { type: Number, default: 0, min: 0, max: 5 },
  numReviews: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 }, // Alias for numReviews
  views: { type: Number, default: 0 },
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  // 🔍 SEO
  seo: {
    metaTitle: { type: String },
    metaDescription: { type: String },
    keywords: { type: String }
  }
}, { timestamps: true });

// Auto-generate slug before saving (if not provided)
productSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
  }
  next();
});

// Indexes for lightning-fast filtering and searching
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, subcategory: 1, brand: 1 });
productSchema.index({ price: 1, rating: -1, isFeatured: -1 });

module.exports = mongoose.model('Product', productSchema);
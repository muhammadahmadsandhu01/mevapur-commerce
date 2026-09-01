const mongoose = require('mongoose');
const slugify = require('slugify');

// Guard Clause: Prevent OverwriteModelError
if (mongoose.models.Product) {
  module.exports = mongoose.models.Product;
} else {
  const productSchema = new mongoose.Schema({
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: 200
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      lowercase: true,
      trim: true,
      maxlength: 200
    },
    shortDescription: {
      type: String,
      default: '',
      maxlength: 500,
      trim: true
    },
    description: {
      type: String,
      default: '',
      maxlength: 10000
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      default: null
    },
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 100
    },
    price: {
      type: Number,
      min: 0,
      default: 0
    },
    originalPrice: {
      type: Number,
      min: 0,
      default: 0
    },
    stock: {
      type: Number,
      min: 0,
      default: 0
    },
    soldCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'inactive', 'archived'],
      default: 'draft',
      required: true
    },
    isActive: {
      type: Boolean,
      default: false,
      required: true
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    attributes: [{
      name: { type: String, required: true, trim: true, maxlength: 50 },
      value: { type: String, required: true, trim: true, maxlength: 100 },
      _id: false
    }],
    variants: [{
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId()
      },
      sku: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        maxlength: 100
      },
      barcode: {
        type: String,
        default: '',
        trim: true,
        maxlength: 100
      },
      attributes: [{
        name: { type: String, required: true, trim: true, maxlength: 50 },
        value: { type: String, required: true, trim: true, maxlength: 100 },
        _id: false
      }],
      price: {
        type: Number,
        required: true,
        min: 0
      },
      salePrice: {
        type: Number,
        min: 0,
        default: 0
      },
      stock: {
        type: Number,
        required: true,
        min: 0,
        default: 0
      },
      mediaAssetIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MediaAsset'
      }],
      images: [{
        type: String,
        trim: true,
        maxlength: 1000
      }],
      isDefault: {
        type: Boolean,
        default: false
      }
    }],
    mediaAssetIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MediaAsset'
    }],
    primaryMediaAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MediaAsset',
      default: null
    },
    image: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000
    },
    images: [{
      type: String,
      trim: true,
      maxlength: 1000
    }],
    primaryImage: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000
    },
    gallery: [{
      type: String,
      trim: true,
      maxlength: 1000
    }],
    videoUrl: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: 0
    },
    views: {
      type: Number,
      default: 0,
      min: 0
    },
    seo: {
      metaTitle: { type: String, trim: true, maxlength: 100 },
      metaDescription: { type: String, trim: true, maxlength: 300 },
      keywords: { type: String, trim: true, maxlength: 200 }
    }
  }, {
    timestamps: true,
    versionKey: '__v'
  });

  // Lifecycle & Integrity Pre-Validation Hook
  productSchema.pre('validate', function(next) {
    // If isActive was explicitly passed as true and status was left as default draft, set status to published
    if (this.isNew && this.isActive === true && this.status === 'draft') {
      this.status = 'published';
    }

    // 1. Single source of lifecycle truth: derive isActive strictly from status === 'published'
    this.isActive = (this.status === 'published');

    // 2. Auto-generate slug if absent
    if ((this.isNew || this.isModified('name')) && !this.slug && this.name) {
      this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
    }

    // 4. Variable product default & stock derivation
    if (this.variants && this.variants.length > 0) {
      let defaultVar = this.variants.find(v => v.isDefault);
      if (!defaultVar) {
        this.variants[0].isDefault = true;
        defaultVar = this.variants[0];
      }
      // Sum variant stocks for root stock
      this.stock = this.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      // Set root price to default variant's price
      this.price = defaultVar.price;
      this.originalPrice = defaultVar.salePrice > 0 ? defaultVar.salePrice : defaultVar.price;
    }

    // 5. Dynamic discount calculation
    if (this.originalPrice > this.price && this.originalPrice > 0) {
      this.discount = Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
    } else {
      this.discount = 0;
    }

    next();
  });

  // Indexes
  productSchema.index({ slug: 1 }, { unique: true, name: 'unique_product_slug' });
  productSchema.index(
    { sku: 1 },
    {
      unique: true,
      partialFilterExpression: { sku: { $type: 'string' } },
      name: 'unique_product_root_sku'
    }
  );
  productSchema.index({ category: 1, isActive: 1, createdAt: -1 });
  productSchema.index({ brand: 1, isActive: 1 });
  productSchema.index({ isActive: 1, status: 1, createdAt: -1 });
  productSchema.index({ isActive: 1, price: 1 });
  productSchema.index({ isActive: 1, rating: -1 });
  productSchema.index({ soldCount: -1 });
  productSchema.index({ name: 'text', description: 'text', shortDescription: 'text' });

  module.exports = mongoose.model('Product', productSchema);
}
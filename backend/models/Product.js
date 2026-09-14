const mongoose = require('mongoose');
const slugify = require('slugify');
const { MoneySchema, MoneyMapper } = require('../modules/commerce');

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
    barcode: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100
    },
    costPrice: {
      type: Number,
      min: 0,
      default: 0,
      select: false
    },
    costPriceExact: {
      type: MoneySchema,
      default: null,
      select: false
    },
    price: {
      type: Number,
      min: 0,
      default: 0
    },
    priceExact: {
      type: MoneySchema,
      default: null
    },
    originalPrice: {
      type: Number,
      min: 0,
      default: 0
    },
    originalPriceExact: {
      type: MoneySchema,
      default: null
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
      enum: ['draft', 'published', 'inactive', 'archived', 'scheduled'],
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
    isNewArrival: {
      type: Boolean,
      default: false
    },
    isBestSeller: {
      type: Boolean,
      default: false
    },
    isTrending: {
      type: Boolean,
      default: false
    },
    allowBackorders: {
      type: Boolean,
      default: false
    },
    trackInventory: {
      type: Boolean,
      default: true
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: 100
    }],
    ingredients: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000
    },
    nutritionalFacts: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000
    },
    storageInstructions: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000
    },
    shelfLife: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500
    },
    countryOfOrigin: {
      type: String,
      default: 'Pakistan',
      trim: true,
      maxlength: 200
    },
    hsClassification: {
      code: {
        type: String,
        trim: true,
        match: [/^\d{6,10}$/, 'HS classification code must contain only 6 to 10 digits without punctuation']
      },
      systemVersion: {
        type: String,
        trim: true,
        maxlength: 30,
        default: 'HS_2022'
      },
      jurisdiction: {
        type: String,
        trim: true,
        maxlength: 30,
        default: 'WCO'
      },
      verificationStatus: {
        type: String,
        enum: ['UNVERIFIED', 'VERIFIED'],
        default: 'UNVERIFIED'
      },
      sourceReference: {
        type: String,
        trim: true,
        maxlength: 100
      }
    },
    customsDescription: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500
    },
    weight: {
      type: Number,
      min: 0
    },
    weightGrams: {
      type: Number,
      min: 1,
      max: 100000000
    },
    dimensions: {
      length: { type: Number, min: 0 },
      width: { type: Number, min: 0 },
      height: { type: Number, min: 0 },
      unit: { type: String, trim: true, default: 'cm' }
    },
    dimensionsMm: {
      length: { type: Number, min: 1 },
      width: { type: Number, min: 1 },
      height: { type: Number, min: 1 }
    },
    declaredValueEligibility: {
      type: String,
      enum: ['UNKNOWN', 'ELIGIBLE', 'INELIGIBLE'],
      default: 'UNKNOWN'
    },
    dangerousGoodsClassification: {
      type: String,
      enum: ['UNKNOWN', 'UNCLASSIFIED', 'NOT_RESTRICTED', 'HAZMAT', 'PERISHABLE', 'FRAGILE', 'LITHIUM_BATTERY'],
      default: 'UNKNOWN'
    },
    shippingClass: {
      type: String,
      default: 'standard',
      trim: true,
      maxlength: 100
    },
    freeShipping: {
      type: Boolean,
      default: false
    },
    taxClass: {
      type: String,
      default: 'standard',
      trim: true,
      maxlength: 100
    },
    publishDate: {
      type: Date,
      default: null
    },
    enableReviews: {
      type: Boolean,
      default: true
    },
    allowWishlist: {
      type: Boolean,
      default: true
    },
    allowCompare: {
      type: Boolean,
      default: true
    },
    allowCOD: {
      type: Boolean,
      default: true
    },
    relatedProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
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
      priceExact: {
        type: MoneySchema,
        default: null
      },
      salePrice: {
        type: Number,
        min: 0,
        default: 0
      },
      salePriceExact: {
        type: MoneySchema,
        default: null
      },
      costPriceExact: {
        type: MoneySchema,
        default: null
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
      },
      weight: {
        type: Number,
        min: 0
      },
      weightGrams: {
        type: Number,
        min: 1,
        max: 100000000
      },
      hsClassification: {
        code: {
          type: String,
          trim: true,
          match: [/^\d{6,10}$/, 'Variant HS classification code must contain only 6 to 10 digits without punctuation']
        },
        systemVersion: {
          type: String,
          trim: true,
          maxlength: 30,
          default: 'HS_2022'
        },
        jurisdiction: {
          type: String,
          trim: true,
          maxlength: 30,
          default: 'WCO'
        },
        verificationStatus: {
          type: String,
          enum: ['UNVERIFIED', 'VERIFIED'],
          default: 'UNVERIFIED'
        },
        sourceReference: {
          type: String,
          trim: true,
          maxlength: 100
        }
      },
      customsDescription: {
        type: String,
        default: '',
        trim: true,
        maxlength: 500
      },
      dimensionsMm: {
        length: { type: Number, min: 1 },
        width: { type: Number, min: 1 },
        height: { type: Number, min: 1 }
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
      keywords: { type: String, trim: true, maxlength: 200 },
      canonicalUrl: { type: String, trim: true, maxlength: 500 }
    }
  }, {
    timestamps: true,
    versionKey: '__v'
  });

  // Lifecycle & Integrity Pre-Validation Hook
  productSchema.pre('validate', function(next) {
    // Check root weight vs weightGrams conflict
    if (this.weight != null && this.weightGrams != null) {
      const convertedKgToGrams = Math.round(this.weight * 1000);
      if (convertedKgToGrams !== this.weightGrams) {
        return next(new Error(`Conflicting product weight (${this.weight}kg) and weightGrams (${this.weightGrams}g)`));
      }
    }

    // Check variant weight vs weightGrams conflict
    if (Array.isArray(this.variants)) {
      for (const variant of this.variants) {
        if (variant.weight != null && variant.weightGrams != null) {
          const convertedVarKgToGrams = Math.round(variant.weight * 1000);
          if (convertedVarKgToGrams !== variant.weightGrams) {
            return next(new Error(`Conflicting variant weight (${variant.weight}kg) and weightGrams (${variant.weightGrams}g)`));
          }
        }
      }
    }
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
      // Derive root pricing from default variant
      const regularPrice = Number(defaultVar.price) || 0;
      const salePrice = Number(defaultVar.salePrice) || 0;
      const hasSalePrice = salePrice > 0 && salePrice < regularPrice;

      this.price = hasSalePrice ? salePrice : regularPrice;
      this.originalPrice = regularPrice;

      if (defaultVar.priceExact) {
        this.priceExact = hasSalePrice && defaultVar.salePriceExact ? defaultVar.salePriceExact : defaultVar.priceExact;
        this.originalPriceExact = defaultVar.priceExact;
      } else if (this.priceExact) {
        this.priceExact = MoneyMapper.fromLegacy(this.price, 'PKR');
        this.originalPriceExact = MoneyMapper.fromLegacy(this.originalPrice, 'PKR');
      }
    }

    // 5. Dynamic discount calculation
    if (this.originalPrice > this.price && this.originalPrice > 0) {
      this.discount = Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
    } else {
      this.discount = 0;
    }

    next();
  });

  // Schema-level synchronous validators for weight vs weightGrams conflict
  productSchema.path('weightGrams').validate(function(val) {
    if (val != null && this.weight != null) {
      if (Math.round(this.weight * 1000) !== val) {
        this.invalidate('weightGrams', `Conflicting product weight (${this.weight}kg) and weightGrams (${val}g)`);
      }
    }
    return true;
  });

  productSchema.path('weight').validate(function(val) {
    if (val != null && this.weightGrams != null) {
      if (Math.round(val * 1000) !== this.weightGrams) {
        this.invalidate('weight', `Conflicting product weight (${val}kg) and weightGrams (${this.weightGrams}g)`);
      }
    }
    return true;
  });

  const variantWeightGrams = productSchema.path('variants').schema.path('weightGrams');
  if (variantWeightGrams) {
    variantWeightGrams.validate(function(val) {
      if (val != null && this.weight != null) {
        if (Math.round(this.weight * 1000) !== val) {
          this.invalidate('weightGrams', `Conflicting variant weight (${this.weight}kg) and weightGrams (${val}g)`);
        }
      }
      return true;
    });
  }

  const variantWeight = productSchema.path('variants').schema.path('weight');
  if (variantWeight) {
    variantWeight.validate(function(val) {
      if (val != null && this.weightGrams != null) {
        if (Math.round(val * 1000) !== this.weightGrams) {
          this.invalidate('weight', `Conflicting variant weight (${val}kg) and weightGrams (${this.weightGrams}g)`);
        }
      }
      return true;
    });
  }

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
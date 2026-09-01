const mongoose = require('mongoose');

// Guard Clause: Prevent OverwriteModelError
if (mongoose.models.SkuRegistry) {
  module.exports = mongoose.models.SkuRegistry;
} else {
  const skuRegistrySchema = new mongoose.Schema({
    sku: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 100
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    isRoot: {
      type: Boolean,
      required: true
    }
  }, {
    timestamps: true
  });

  // Single named unique index on normalized global SKU
  skuRegistrySchema.index({ sku: 1 }, { unique: true, name: 'unique_global_sku' });
  skuRegistrySchema.index({ product: 1, variantId: 1 });

  module.exports = mongoose.model('SkuRegistry', skuRegistrySchema);
}

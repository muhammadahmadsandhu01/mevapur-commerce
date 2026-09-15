/**
 * @file InventoryPosition.js
 * @description Canonical per-location product and variant inventory position for Phase 6D-2.
 * Enforces bounded integer quantities, strict non-negative ATP formulas, safety stock isolation,
 * optimistic concurrency control via lockVersion, and tenant/location/product unique scoping.
 */

const mongoose = require('mongoose');

const inventoryPositionSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FulfillmentLocation',
    required: [true, 'Fulfillment location ID is required']
  },
  locationCode: {
    type: String,
    required: [true, 'Location code is required'],
    trim: true,
    uppercase: true,
    maxlength: 50
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product ID is required']
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  scopeType: {
    type: String,
    enum: ['product', 'variant'],
    required: true,
    default: 'product'
  },
  scopeKey: {
    type: String,
    required: true,
    trim: true,
    default: function() {
      if (this.scopeType === 'variant' && this.variantId) {
        return String(this.variantId);
      }
      return 'product';
    },
    maxlength: 100
  },
  canonicalSku: {
    type: String,
    required: [true, 'Canonical SKU is required'],
    trim: true,
    uppercase: true,
    maxlength: 100
  },
  onHand: {
    type: Number,
    required: true,
    min: [0, 'Physical on-hand quantity cannot be negative'],
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'onHand must be a non-negative integer'
    }
  },
  reserved: {
    type: Number,
    required: true,
    min: [0, 'Reserved quantity cannot be negative'],
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'reserved must be a non-negative integer'
    }
  },
  unavailable: {
    type: Number,
    required: true,
    min: [0, 'Unavailable quantity cannot be negative'],
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'unavailable must be a non-negative integer'
    }
  },
  safetyStock: {
    type: Number,
    required: true,
    min: [0, 'Safety stock cannot be negative'],
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'safetyStock must be a non-negative integer'
    }
  },
  reorderPoint: {
    type: Number,
    required: true,
    min: [0, 'Reorder point cannot be negative'],
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'reorderPoint must be a non-negative integer'
    }
  },
  allowBackorder: {
    type: Boolean,
    default: false
  },
  backorderLimit: {
    type: Number,
    min: [0, 'Backorder limit cannot be negative'],
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'backorderLimit must be a non-negative integer'
    }
  },
  lockVersion: {
    type: Number,
    default: 1,
    min: 1
  },
  lastLedgerSequence: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Calculate ATP (Available to Promise)
inventoryPositionSchema.methods.calculateATP = function() {
  const baseAvailable = this.onHand - this.reserved - this.unavailable - this.safetyStock;
  if (this.allowBackorder && this.backorderLimit > 0) {
    return Math.max(0, baseAvailable + this.backorderLimit);
  }
  return Math.max(0, baseAvailable);
};

// Virtual property for ATP
inventoryPositionSchema.virtual('atp').get(function() {
  return this.calculateATP();
});

// Static helper to calculate ATP formula
inventoryPositionSchema.statics.calculateATPFromFields = function(fields) {
  const onHand = Number(fields.onHand) || 0;
  const reserved = Number(fields.reserved) || 0;
  const unavailable = Number(fields.unavailable) || 0;
  const safetyStock = Number(fields.safetyStock) || 0;
  const allowBackorder = Boolean(fields.allowBackorder);
  const backorderLimit = Number(fields.backorderLimit) || 0;

  const baseAvailable = onHand - reserved - unavailable - safetyStock;
  if (allowBackorder && backorderLimit > 0) {
    return Math.max(0, baseAvailable + backorderLimit);
  }
  return Math.max(0, baseAvailable);
};

// Pre-validate hook: enforce scopeType / scopeKey consistency
inventoryPositionSchema.pre('validate', function() {
  if (this.scopeType === 'variant') {
    if (!this.variantId) {
      throw new Error('variantId is required when scopeType is variant');
    }
    this.scopeKey = String(this.variantId);
  } else {
    this.scopeType = 'product';
    this.scopeKey = 'product';
    this.variantId = null;
  }
});

// Compound Unique Index: merchantScopeId + locationId + productId + scopeType + scopeKey
inventoryPositionSchema.index(
  { merchantScopeId: 1, locationId: 1, productId: 1, scopeType: 1, scopeKey: 1 },
  { unique: true, name: 'unique_tenant_location_product_scope' }
);

inventoryPositionSchema.index(
  { merchantScopeId: 1, productId: 1, scopeKey: 1, locationId: 1 },
  { name: 'tenant_product_scope_location_idx' }
);

inventoryPositionSchema.index(
  { merchantScopeId: 1, canonicalSku: 1 },
  { name: 'tenant_sku_lookup_idx' }
);

inventoryPositionSchema.index(
  { merchantScopeId: 1, locationId: 1, onHand: 1 },
  { name: 'tenant_location_stock_idx' }
);

module.exports = mongoose.models.InventoryPosition || mongoose.model('InventoryPosition', inventoryPositionSchema);

const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  // Store Information
  store: {
    store_name: { type: String, default: 'MevaPur' },
    store_email: { type: String, default: '' },
    store_phone: { type: String, default: '' },
    store_address: { type: String, default: '' },
    currency: { type: String, default: 'PKR' }
  },
  
  // Shipping Configuration
  shipping: {
    shipping_flat_rate: { type: Number, default: 150 },
    free_shipping_min: { type: Number, default: 0 },
    delivery_days: { type: Number, default: 3 }
  },
  
  // Tax Configuration
  tax: {
    tax_enabled: { type: Boolean, default: false },
    tax_rate: { type: Number, default: 0 }
  },
  
  // Payment Gateways
  payment: {
    cod_enabled: { type: Boolean, default: true },
    jazzcash_enabled: { type: Boolean, default: false },
    jazzcash_merchant_id: { type: String, default: '' },
    jazzcash_password: { type: String, default: '' },
    visa_enabled: { type: Boolean, default: false },
    visa_merchant_id: { type: String, default: '' },
    visa_api_key: { type: String, default: '' },
    visa_secret_key: { type: String, default: '' },
    mastercard_enabled: { type: Boolean, default: false },
    mastercard_merchant_id: { type: String, default: '' },
    mastercard_api_key: { type: String, default: '' },
    mastercard_secret_key: { type: String, default: '' }
  },
  
  // Social Media Links
  social: {
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    twitter: { type: String, default: '' },
    youtube: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    website: { type: String, default: '' }
  },

  // Legacy / Public fields for frontend compatibility
  storeName: { type: String, default: 'MevaPur' },
  logo: { type: String, default: '' },
  maintenanceMode: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('Setting', settingSchema);
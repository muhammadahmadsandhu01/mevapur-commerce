const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  storeName: {
    type: String,
    default: 'MevaPur'
  },
  storeDescription: {
    type: String,
    default: ''
  },
  logo: {
    type: String,
    default: ''
  },
  favicon: {
    type: String,
    default: ''
  },
  contactEmail: {
    type: String,
    default: ''
  },
  contactPhone: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  currency: {
    type: String,
    default: 'PKR'
  },
  currencySymbol: {
    type: String,
    default: 'Rs.'
  },
  timezone: {
    type: String,
    default: 'Asia/Karachi'
  },
  // Payment Settings
  paymentMethods: {
    cod: { type: Boolean, default: true },
    jazzcash: { type: Boolean, default: false },
    stripe: { type: Boolean, default: false }
  },
  jazzcashMerchantId: String,
  jazzcashPassword: String,
  stripeSecretKey: String,
  stripePublishableKey: String,
  // Shipping Settings
  shippingEnabled: {
    type: Boolean,
    default: true
  },
  freeShippingThreshold: {
    type: Number,
    default: 0
  },
  flatShippingRate: {
    type: Number,
    default: 150
  },
  shippingZones: [{
    name: String,
    cities: [String],
    rate: Number
  }],
  // Email Settings
  emailHost: String,
  emailPort: Number,
  emailUser: String,
  emailPassword: String,
  emailFrom: String,
  // SMS Settings
  smsEnabled: {
    type: Boolean,
    default: false
  },
  smsProvider: String,
  smsApiKey: String,
  // SEO Settings
  metaTitle: String,
  metaDescription: String,
  metaKeywords: String,
  googleAnalyticsId: String,
  facebookPixelId: String,
  // Social Media
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    youtube: String,
    tiktok: String
  },
  // Maintenance Mode
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'We are currently performing maintenance. Please check back soon.'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Setting', settingSchema);
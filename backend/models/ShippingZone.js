const mongoose = require('mongoose');
const { MoneySchema } = require('../modules/commerce');

const shippingZoneSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  enabled: { type: Boolean, default: true },
  countries: [{ type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ }],
  regions: [{ type: String, trim: true, maxlength: 100 }],
  cities: [{ type: String, trim: true, maxlength: 100 }],
  normalRate: { type: Number, required: true, min: 0 },
  normalRateExact: { type: MoneySchema, default: null },
  freeShippingThreshold: { type: Number, required: true, min: 0 },
  freeShippingThresholdExact: { type: MoneySchema, default: null },
  remoteRate: { type: Number, default: null, min: 0 },
  remoteRateExact: { type: MoneySchema, default: null },
  currency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/, default: 'PKR' },
  remoteCities: [{ type: String, trim: true, maxlength: 100 }],
  deliveryMinDays: { type: Number, required: true, min: 0, max: 60 },
  deliveryMaxDays: { type: Number, required: true, min: 0, max: 60 },
  remoteDeliveryMinDays: { type: Number, default: null, min: 0, max: 60 },
  remoteDeliveryMaxDays: { type: Number, default: null, min: 0, max: 60 },
  priority: { type: Number, default: 100, min: 0, max: 10000 }
}, { timestamps: true });

shippingZoneSchema.index({ enabled: 1, priority: 1, countries: 1 });
shippingZoneSchema.pre('validate', function validateDays(next) {
  if (this.deliveryMaxDays < this.deliveryMinDays) return next(new Error('Delivery maximum must not be lower than minimum'));
  if (this.remoteDeliveryMaxDays != null && this.remoteDeliveryMinDays != null && this.remoteDeliveryMaxDays < this.remoteDeliveryMinDays) return next(new Error('Remote delivery maximum must not be lower than minimum'));
  next();
});

module.exports = mongoose.models.ShippingZone || mongoose.model('ShippingZone', shippingZoneSchema);

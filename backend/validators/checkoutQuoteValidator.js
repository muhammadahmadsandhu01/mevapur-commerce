/**
 * @file checkoutQuoteValidator.js
 * @description Input validation schemas for checkout quote generation and verification.
 */

const { z } = require('zod');
const mongoose = require('mongoose');

const objectId = z.string().refine(
  (value) => mongoose.isObjectIdOrHexString(value),
  'A valid MongoDB ObjectId is required'
);

const optionalTrimmed = (schema) => z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  schema.optional()
);

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use an ISO 3166-1 alpha-2 country code');
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 currency code');

const quoteItemSchema = z.object({
  productId: objectId,
  variantId: optionalTrimmed(objectId),
  quantity: z.number().int().min(1, 'Quantity must be at least one').max(100, 'Quantity cannot exceed 100')
}).strict();

const quoteAddressSchema = z.object({
  fullName: optionalTrimmed(z.string().trim().min(2).max(100)),
  phone: optionalTrimmed(z.string().trim().regex(/^\+?[0-9][0-9 -]{6,19}$/, 'A valid phone number is required')),
  address: z.string().trim().min(5).max(300),
  addressLine2: optionalTrimmed(z.string().trim().max(200)),
  city: z.string().trim().min(1).max(100),
  province: optionalTrimmed(z.string().trim().max(100)),
  postalCode: optionalTrimmed(z.string().trim().max(20)),
  country: optionalTrimmed(z.string().trim().min(2).max(100)),
  countryCode: optionalTrimmed(countryCode)
}).refine(
  (data) => Boolean(data.country || data.countryCode),
  { message: 'Country or countryCode is required', path: ['country'] }
);

const createCheckoutQuoteSchema = z.object({
  items: z.array(quoteItemSchema).min(1, 'Quote requires at least one item').max(50),
  shippingAddress: quoteAddressSchema,
  currency: optionalTrimmed(currencyCode),
  couponCode: optionalTrimmed(z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_-]+$/)),
  shippingServiceLevel: z.string().trim().toLowerCase().max(50).optional().default('standard'),
  shippingAdapter: optionalTrimmed(z.string().trim().max(50))
}).strict();

module.exports = {
  createCheckoutQuoteSchema,
  quoteItemSchema,
  quoteAddressSchema
};

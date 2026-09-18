/**
 * @file checkoutSessionValidator.js
 * @description Input validation schemas for two-phase checkout session creation and management.
 */

'use strict';

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

const sessionItemSchema = z.object({
  productId: objectId,
  variantId: optionalTrimmed(objectId),
  quantity: z.number().int().min(1, 'Quantity must be at least one').max(100, 'Quantity cannot exceed 100')
}).strict();

const sessionAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(5).max(50),
  address: z.string().trim().min(5).max(300),
  addressLine2: optionalTrimmed(z.string().trim().max(200)),
  city: z.string().trim().min(1).max(100),
  province: optionalTrimmed(z.string().trim().max(100)),
  postalCode: optionalTrimmed(z.string().trim().max(20)),
  country: optionalTrimmed(z.string().trim().min(2).max(100)),
  countryCode: optionalTrimmed(countryCode)
}).strict().refine(
  (data) => Boolean(data.country || data.countryCode),
  { message: 'Country or countryCode is required', path: ['country'] }
);

const createCheckoutSessionSchema = z.object({
  items: z.array(sessionItemSchema).min(1, 'Checkout session requires at least one item').max(50),
  shippingAddress: sessionAddressSchema,
  paymentMethod: z.string().trim().min(2).max(50),
  currency: optionalTrimmed(currencyCode),
  couponCode: optionalTrimmed(z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_-]+$/)),
  shippingServiceLevel: z.string().trim().toLowerCase().max(50).optional().default('standard'),
  shippingAdapter: optionalTrimmed(z.string().trim().max(50)),
  customerNote: optionalTrimmed(z.string().trim().max(300)),
  quoteToken: z.string().trim().min(10, 'A valid checkout quoteToken is required')
}).strict();

const sessionIdParamSchema = z.object({
  sessionId: z.string().trim().regex(/^cs_[a-f0-9]{48}$/, 'A valid checkout sessionId is required')
}).strict();

const cancelSessionSchema = z.object({
  reason: optionalTrimmed(z.string().trim().max(300))
}).strict();

const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string().trim().min(1).max(128)
}).passthrough();

module.exports = {
  createCheckoutSessionSchema,
  sessionIdParamSchema,
  cancelSessionSchema,
  idempotencyHeaderSchema
};

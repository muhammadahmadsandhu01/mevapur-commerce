const { z } = require('zod');
const mongoose = require('mongoose');

const objectId = z.string().refine((value) => mongoose.isObjectIdOrHexString(value), 'A valid MongoDB ObjectId is required');
const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use an ISO 3166-1 alpha-2 country code');
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 currency code');
const shortText = (max) => z.string().trim().min(1).max(max);

const productQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(100).optional(),
  category: objectId.optional(), brand: objectId.optional(), subcategory: objectId.optional(),
  minPrice: z.coerce.number().finite().min(0).optional(), maxPrice: z.coerce.number().finite().min(0).optional(),
  rating: z.coerce.number().finite().min(0).max(5).optional(),
  inStock: z.enum(['true', 'false']).optional(), autocomplete: z.enum(['true']).optional(),
  sortBy: z.enum(['price-asc', 'price-desc', 'rating', 'best-selling', 'newest']).default('newest'),
  page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(50).default(12)
}).strict().superRefine((value, context) => { if (value.minPrice != null && value.maxPrice != null && value.minPrice > value.maxPrice) context.addIssue({ code: 'custom', path: ['maxPrice'], message: 'Maximum price must not be lower than minimum price' }); });

const inventoryAdjustmentSchema = z.object({
  productId: objectId, variantId: objectId.optional(), type: z.enum(['in', 'out', 'adjustment']),
  quantity: z.number().int().min(0).max(100000000), reason: shortText(500), reference: z.string().trim().max(200).optional(), operationKey: z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/).optional()
}).strict().superRefine((value, context) => { if (value.type !== 'adjustment' && value.quantity < 1) context.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be at least one' }); });

const trackingSchema = z.object({ courierCompany: z.string().trim().max(100).optional(), trackingNumber: z.string().trim().max(100).optional() }).strict().refine((value) => Boolean(value.courierCompany || value.trackingNumber), 'Provide a courier or tracking number');
const marketSchema = z.object({ homeCountry: country, sellingMode: z.enum(['domestic', 'international', 'hybrid']), enabledCountries: z.array(country).min(1).max(250), defaultCurrency: currency, enabledCurrencies: z.array(currency).min(1).max(50), defaultLocale: z.string().trim().min(2).max(35).optional(), isEnabled: z.boolean() }).strict();
const shippingZoneSchema = z.object({ name: shortText(100), enabled: z.boolean(), countries: z.array(country).min(1).max(250), regions: z.array(shortText(100)).max(100).default([]), cities: z.array(shortText(100)).max(500).default([]), normalRate: z.number().finite().min(0).max(100000000), freeShippingThreshold: z.number().finite().min(0).max(100000000), remoteRate: z.number().finite().min(0).max(100000000).nullable().optional(), remoteCities: z.array(shortText(100)).max(500).default([]), deliveryMinDays: z.number().int().min(0).max(60), deliveryMaxDays: z.number().int().min(0).max(60), remoteDeliveryMinDays: z.number().int().min(0).max(60).nullable().optional(), remoteDeliveryMaxDays: z.number().int().min(0).max(60).nullable().optional(), priority: z.number().int().min(0).max(10000).default(100) }).strict().superRefine((value, context) => { if (value.deliveryMaxDays < value.deliveryMinDays) context.addIssue({ code: 'custom', path: ['deliveryMaxDays'], message: 'Delivery maximum must not be lower than minimum' }); });
const quoteSchema = z.object({ country, currency, subtotal: z.coerce.number().finite().min(0).max(100000000), city: z.string().trim().max(100).optional(), region: z.string().trim().max(100).optional(), postalCode: z.string().trim().max(20).optional() }).strict();

module.exports = { productQuerySchema, inventoryAdjustmentSchema, trackingSchema, marketSchema, shippingZoneSchema, quoteSchema };

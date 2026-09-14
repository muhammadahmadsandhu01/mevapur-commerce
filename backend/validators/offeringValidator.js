/**
 * @file offeringValidator.js
 * @description Strict Zod validators for Product Market Offerings and Exact Price Books.
 */

const { z } = require('zod');
const mongoose = require('mongoose');
const { CountryRegistry, CurrencyRegistry } = require('../modules/commerce');

const objectId = z.string().refine((val) => mongoose.isObjectIdOrHexString(val), {
  message: 'Valid MongoDB ObjectId required'
});

const countryCode = z.string().trim().toUpperCase().refine((val) => /^[A-Z]{2}$/.test(val) && CountryRegistry.hasCountry(val), {
  message: 'Valid ISO 3166-1 alpha-2 country code required'
});

const currencyCode = z.string().trim().toUpperCase().refine((val) => /^[A-Z]{3}$/.test(val) && CurrencyRegistry.has(val), {
  message: 'Valid ISO 4217 currency code required'
});

const integerMinorString = z.string().trim().regex(/^\d+$/, 'Amount must be an exact non-negative integer string');

const singleOfferingSchema = z.object({
  marketCountry: countryCode,
  status: z.enum(['draft', 'active', 'suspended', 'retired']).default('active'),
  visibility: z.enum(['visible', 'hidden']).default('visible'),
  fulfillmentMode: z.enum(['local', 'cross_border', 'hybrid']).default('local'),
  eligibleFulfillmentOriginIds: z.array(z.string().trim().max(64)).max(50).default([]),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  saleConstraints: z.object({
    minQuantity: z.number().int().min(1).default(1),
    maxQuantity: z.number().int().min(1).nullable().optional()
  }).optional(),
  lockVersion: z.number().int().min(1).optional()
}).strict().superRefine((val, ctx) => {
  if (val.effectiveFrom && val.effectiveTo && val.effectiveTo < val.effectiveFrom) {
    ctx.addIssue({
      code: 'custom',
      path: ['effectiveTo'],
      message: 'effectiveTo must not be earlier than effectiveFrom'
    });
  }
  if (val.saleConstraints?.maxQuantity && val.saleConstraints.minQuantity > val.saleConstraints.maxQuantity) {
    ctx.addIssue({
      code: 'custom',
      path: ['saleConstraints', 'maxQuantity'],
      message: 'maxQuantity must be greater than or equal to minQuantity'
    });
  }
});

const singlePriceBookEntrySchema = z.object({
  marketCountry: countryCode,
  currency: currencyCode,
  currencyExponent: z.number().int().min(0).max(4).optional(),
  amountMinor: integerMinorString,
  compareAtAmountMinor: integerMinorString.nullable().optional(),
  priceSource: z.enum(['manual', 'governed_fx_snapshot']).default('manual'),
  fxSnapshotReference: z.object({
    snapshotId: z.string().trim().max(64),
    baseCurrency: currencyCode,
    targetCurrency: currencyCode,
    rateNumerator: z.number().int().min(1),
    rateDenominator: z.number().int().min(1).default(10000),
    capturedAt: z.coerce.date().optional()
  }).nullable().optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  status: z.enum(['draft', 'active', 'superseded', 'retired']).default('active'),
  lockVersion: z.number().int().min(1).optional()
}).strict().superRefine((val, ctx) => {
  if (val.effectiveFrom && val.effectiveTo && val.effectiveTo < val.effectiveFrom) {
    ctx.addIssue({
      code: 'custom',
      path: ['effectiveTo'],
      message: 'effectiveTo must not be earlier than effectiveFrom'
    });
  }
  if (val.compareAtAmountMinor && BigInt(val.compareAtAmountMinor) < BigInt(val.amountMinor)) {
    ctx.addIssue({
      code: 'custom',
      path: ['compareAtAmountMinor'],
      message: 'compareAtAmountMinor cannot be lower than selling amountMinor'
    });
  }
});

const updateOfferingsPayloadSchema = z.object({
  offerings: z.array(singleOfferingSchema).min(1).max(50)
}).strict();

const updatePricesPayloadSchema = z.object({
  prices: z.array(singlePriceBookEntrySchema).min(1).max(100)
}).strict();

const offeringBodySchema = z.union([
  updateOfferingsPayloadSchema,
  singleOfferingSchema
]);

const priceBodySchema = z.union([
  updatePricesPayloadSchema,
  singlePriceBookEntrySchema
]);

module.exports = {
  singleOfferingSchema,
  singlePriceBookEntrySchema,
  updateOfferingsPayloadSchema,
  updatePricesPayloadSchema,
  offeringBodySchema,
  priceBodySchema
};

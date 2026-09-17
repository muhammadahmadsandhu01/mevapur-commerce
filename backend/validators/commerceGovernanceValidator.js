/**
 * @file commerceGovernanceValidator.js
 * @description Zod validation schemas for commerce configuration governance endpoints.
 */

const { z } = require('zod');
const mongoose = require('mongoose');

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Must be a 2-letter ISO 3166-1 alpha-2 country code');
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO 4217 currency code');

const moneyExactSchema = z.object({
  amountMinor: z.union([z.string(), z.number()]).refine((val) => {
    if (typeof val === 'number') {
      return Number.isSafeInteger(val) && val >= 0;
    }
    const s = String(val).trim();
    if (!/^\d+$/.test(s)) return false;
    try {
      const b = BigInt(s);
      return b >= 0n && b <= 999999999999999999n;
    } catch {
      return false;
    }
  }, { message: 'amountMinor must be a non-negative integer up to 18 digits without decimals or scientific notation' }),
  currency: currencyCode,
  exponent: z.number().int().min(0).max(4).optional().default(2)
}).strict();

const postalCodeRangeSchema = z.object({
  type: z.enum(['exact', 'prefix', 'numeric_range']),
  value: z.string().trim().max(20).optional(),
  min: z.string().trim().max(20).optional(),
  max: z.string().trim().max(20).optional()
}).strict();

const weightBandSchema = z.object({
  minWeightGrams: z.number().int().min(0),
  maxWeightGrams: z.number().int().min(1),
  rateExact: moneyExactSchema,
  pricingMode: z.enum(['REPLACE_BASE', 'ADD_TO_BASE']).optional().default('REPLACE_BASE')
}).strict();

const fulfillmentOriginSchema = z.object({
  originId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  country: countryCode,
  subdivision: z.string().trim().max(50).optional().default(''),
  city: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().max(20).optional().default(''),
  addressLine1: z.string().trim().max(200).optional().default(''),
  addressLine2: z.string().trim().max(200).optional().default(''),
  timeZone: z.string().trim().min(1).max(60),
  enabled: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false)
}).strict();

const merchantProfileSchema = z.object({
  merchantCountry: countryCode,
  legalName: z.string().trim().max(200).optional().default(''),
  sellingMode: z.enum(['domestic', 'international', 'hybrid']),
  baseCurrency: currencyCode,
  defaultCurrency: currencyCode,
  enabledCurrencies: z.array(currencyCode).min(1).max(50),
  enabledCountries: z.array(countryCode).min(1).max(250),
  defaultLocale: z.string().trim().min(2).max(35).optional().default('en-PK'),
  defaultTimeZone: z.string().trim().min(1).max(60).optional().default('Asia/Karachi'),
  fulfillmentOrigins: z.array(fulfillmentOriginSchema).min(1).max(20),
  supportedIncoterms: z.array(z.enum(['DOMESTIC', 'DAP', 'DDP', 'CIF', 'FOB', 'EXW'])).min(1).max(10),
  taxCalculationMode: z.enum(['exact_rational']).optional().default('exact_rational')
}).strict();

const timeFormatRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const workingDaysSchema = z.array(z.number().int().min(1).max(7))
  .min(1, 'workingDays must contain at least 1 day')
  .max(7, 'workingDays cannot exceed 7 days')
  .refine((days) => new Set(days).size === days.length, {
    message: 'workingDays entries must be unique'
  });

const shippingRuleSchema = z.object({
  ruleId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  serviceCode: z.string().trim().min(1).max(50),
  displayName: z.string().trim().min(1).max(100),
  originCountry: countryCode,
  destinationCountry: countryCode,
  destinationSubdivisions: z.array(z.string().trim().max(50)).max(100).optional().default([]),
  postalCodeRanges: z.array(postalCodeRangeSchema).max(100).optional().default([]),
  currency: currencyCode,
  baseRateExact: moneyExactSchema,
  freeShippingThresholdExact: moneyExactSchema.nullable().optional(),
  remoteRateExact: moneyExactSchema.nullable().optional(),
  remotePostalPrefixes: z.array(z.string().trim().max(20)).max(100).optional().default([]),
  remoteCities: z.array(z.string().trim().max(100)).max(100).optional().default([]),
  deliveryMinDays: z.number().int().min(0).max(120),
  deliveryMaxDays: z.number().int().min(0).max(120),
  remoteDeliveryMinDays: z.number().int().min(0).max(120).nullable().optional(),
  remoteDeliveryMaxDays: z.number().int().min(0).max(120).nullable().optional(),
  processingCutoffLocal: z.string().trim().regex(timeFormatRegex, 'Cutoff must be in HH:mm 24-hour format (00:00 - 23:59)'),
  workingDays: workingDaysSchema,
  processingMinBusinessDays: z.number().int().min(0).max(120),
  processingMaxBusinessDays: z.number().int().min(0).max(120),
  weightBands: z.array(weightBandSchema).max(20).optional().default([]),
  priority: z.number().int().min(0).max(10000).optional().default(100),
  supportedIncoterms: z.array(z.enum(['DOMESTIC', 'DAP', 'DDP', 'CIF', 'FOB', 'EXW'])).max(10).optional().default(['DOMESTIC', 'DAP']),
  enabled: z.boolean().optional().default(true)
}).strict().superRefine((data, ctx) => {
  if (data.deliveryMaxDays < data.deliveryMinDays) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'deliveryMaxDays cannot be less than deliveryMinDays',
      path: ['deliveryMaxDays']
    });
  }
  if (data.processingMaxBusinessDays < data.processingMinBusinessDays) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'processingMaxBusinessDays cannot be less than processingMinBusinessDays',
      path: ['processingMaxBusinessDays']
    });
  }
  if (data.remoteDeliveryMaxDays != null && data.remoteDeliveryMinDays != null && data.remoteDeliveryMaxDays < data.remoteDeliveryMinDays) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'remoteDeliveryMaxDays cannot be less than remoteDeliveryMinDays',
      path: ['remoteDeliveryMaxDays']
    });
  }
});

const taxRuleSchema = z.object({
  ruleId: z.string().trim().min(1).max(64),
  destinationCountry: countryCode,
  destinationSubdivision: z.string().trim().max(50).optional().default(''),
  taxType: z.enum(['VAT', 'GST', 'SALES_TAX', 'CUSTOMS_VAT', 'EXEMPT']),
  taxTreatment: z.enum(['inclusive', 'exclusive']).optional().default('exclusive'),
  taxableBasis: z.enum(['subtotal', 'subtotal_shipping', 'cif']).optional().default('subtotal'),
  taxRateNumerator: z.number().int().min(0).max(10000000),
  taxRateDenominator: z.number().int().min(1).max(10000000).optional().default(10000),
  dutyRateNumerator: z.number().int().min(0).max(10000000).optional().default(0),
  dutyRateDenominator: z.number().int().min(1).max(10000000).optional().default(10000),
  roundingMode: z.enum(['HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEIL']).optional().default('HALF_UP'),
  roundingScope: z.enum(['subtotal', 'per_item']).optional().default('subtotal'),
  incoterm: z.enum(['DOMESTIC', 'DAP', 'DDP']),
  priority: z.number().int().min(0).max(10000).optional().default(100),
  customsDutyDeMinimisExact: moneyExactSchema.nullable().optional(),
  importTaxDeMinimisExact: moneyExactSchema.nullable().optional(),
  deMinimisBasis: z.enum(['GOODS_VALUE', 'CUSTOMS_VALUE', 'CIF']).nullable().optional(),
  deMinimisComparison: z.enum(['LT', 'LTE']).nullable().optional(),
  customsValueIncludesShipping: z.boolean().optional(),
  customsValueIncludesInsurance: z.boolean().optional(),
  dutyRefundPolicy: z.enum(['REFUNDABLE', 'NON_REFUNDABLE', 'MANUAL_REVIEW']).nullable().optional(),
  taxRefundPolicy: z.enum(['REFUNDABLE', 'NON_REFUNDABLE', 'PROPORTIONAL', 'MANUAL_REVIEW']).nullable().optional(),
  providerType: z.enum(['MANUAL_GOVERNED', 'EXTERNAL_PROVIDER']).optional().default('MANUAL_GOVERNED'),
  providerReference: z.string().trim().max(200).nullable().optional(),
  exemptionThresholdExact: moneyExactSchema.nullable().optional(),
  sourceAuthority: z.string().trim().min(1).max(200),
  sourceReference: z.string().trim().min(1).max(200),
  sourcePublicationDate: z.coerce.date().nullable().optional(),
  verificationStatus: z.enum(['UNVERIFIED_ESTIMATE', 'VERIFIED_LEGAL_RULE']).optional().default('UNVERIFIED_ESTIMATE'),
  requiresTax: z.boolean().optional().default(true),
  requiresDuty: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true)
}).strict();

const createDraftSchema = z.object({
  merchantScopeId: z.string().trim().max(100).optional(),
  sourceVersionId: z.string().trim().optional(),
  merchantProfile: merchantProfileSchema.optional(),
  shippingRules: z.array(shippingRuleSchema).max(250).optional(),
  taxRules: z.array(taxRuleSchema).max(500).optional(),
  changeNotes: z.string().trim().max(1000).optional()
}).strict();

const updateDraftSchema = z.object({
  merchantScopeId: z.string().trim().max(100).optional(),
  expectedLockVersion: z.number().int().min(1).optional(),
  merchantProfile: merchantProfileSchema.optional(),
  shippingRules: z.array(shippingRuleSchema).max(250).optional(),
  taxRules: z.array(taxRuleSchema).max(500).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  changeNotes: z.string().trim().max(1000).optional()
}).strict();

const activateVersionSchema = z.object({
  merchantScopeId: z.string().trim().max(100).optional(),
  effectiveFrom: z.coerce.date().optional()
}).strict();

const retireVersionSchema = z.object({
  merchantScopeId: z.string().trim().max(100).optional(),
  reason: z.string().trim().max(500).optional(),
  isEmergency: z.boolean().optional().default(false)
}).strict();

const previewQuoteSchema = z.object({
  configId: z.string().min(1),
  merchantScopeId: z.string().trim().max(100).optional(),
  destination: z.object({
    countryCode: countryCode,
    province: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(20).optional()
  }).strict(),
  items: z.array(z.object({
    productId: z.string().optional(),
    name: z.string().trim().max(200).optional(),
    price: z.number().positive(),
    quantity: z.number().int().positive(),
    weightGrams: z.number().positive().optional()
  }).strict()).min(1).max(100),
  currency: currencyCode.optional(),
  shippingServiceLevel: z.enum(['standard', 'express']).optional().default('standard')
}).strict();

module.exports = {
  createDraftSchema,
  updateDraftSchema,
  activateVersionSchema,
  retireVersionSchema,
  previewQuoteSchema,
  taxRuleSchema,
  shippingRuleSchema,
  merchantProfileSchema,
  moneyExactSchema
};

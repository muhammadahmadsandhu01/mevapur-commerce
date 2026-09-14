/**
 * @file commerceGovernanceValidator.js
 * @description Zod validation schemas for commerce configuration governance endpoints.
 */

const { z } = require('zod');
const mongoose = require('mongoose');

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Must be a 2-letter ISO 3166-1 alpha-2 country code');
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO 4217 currency code');

const moneyExactSchema = z.object({
  amountMinor: z.union([z.string(), z.number()]),
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
  fulfillmentOrigins: z.array(fulfillmentOriginSchema).min(1),
  supportedIncoterms: z.array(z.enum(['DOMESTIC', 'DAP', 'DDP', 'CIF', 'FOB', 'EXW'])).min(1),
  taxCalculationMode: z.enum(['exact_rational']).optional().default('exact_rational')
}).strict();

const shippingRuleSchema = z.object({
  ruleId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  serviceCode: z.string().trim().min(1).max(50),
  displayName: z.string().trim().min(1).max(100),
  originCountry: countryCode,
  destinationCountry: countryCode,
  destinationSubdivisions: z.array(z.string().trim().max(50)).optional().default([]),
  postalCodeRanges: z.array(postalCodeRangeSchema).optional().default([]),
  currency: currencyCode,
  baseRateExact: moneyExactSchema,
  freeShippingThresholdExact: moneyExactSchema.nullable().optional(),
  remoteRateExact: moneyExactSchema.nullable().optional(),
  remotePostalPrefixes: z.array(z.string().trim().max(20)).optional().default([]),
  remoteCities: z.array(z.string().trim().max(100)).optional().default([]),
  deliveryMinDays: z.number().int().min(0).max(120),
  deliveryMaxDays: z.number().int().min(0).max(120),
  remoteDeliveryMinDays: z.number().int().min(0).max(120).nullable().optional(),
  remoteDeliveryMaxDays: z.number().int().min(0).max(120).nullable().optional(),
  weightBands: z.array(weightBandSchema).optional().default([]),
  priority: z.number().int().min(0).max(10000).optional().default(100),
  supportedIncoterms: z.array(z.enum(['DOMESTIC', 'DAP', 'DDP', 'CIF', 'FOB', 'EXW'])).optional().default(['DOMESTIC', 'DAP']),
  enabled: z.boolean().optional().default(true)
}).strict();

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
  shippingRules: z.array(shippingRuleSchema).optional(),
  taxRules: z.array(taxRuleSchema).optional(),
  changeNotes: z.string().trim().max(1000).optional()
}).strict();

const updateDraftSchema = z.object({
  merchantScopeId: z.string().trim().max(100).optional(),
  expectedLockVersion: z.number().int().min(1).optional(),
  merchantProfile: merchantProfileSchema.optional(),
  shippingRules: z.array(shippingRuleSchema).optional(),
  taxRules: z.array(taxRuleSchema).optional(),
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
  }).strict()).min(1),
  currency: currencyCode.optional(),
  shippingServiceLevel: z.enum(['standard', 'express']).optional().default('standard')
}).strict();

module.exports = {
  createDraftSchema,
  updateDraftSchema,
  activateVersionSchema,
  retireVersionSchema,
  previewQuoteSchema
};

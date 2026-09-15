/**
 * @file inventoryValidator.js
 * @description Zod validation schemas for Phase 6D-2 multi-origin inventory, location governance,
 * stock adjustments, reservation administration, and return lifecycle endpoints.
 */

const { z } = require('zod');
const mongoose = require('mongoose');

const objectId = z.string().refine(
  (val) => mongoose.isObjectIdOrHexString(val),
  'A valid MongoDB ObjectId is required'
);

const optionalObjectId = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  objectId.optional()
);

const optionalTrimmedString = (min = 1, max = 200) => z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : (typeof val === 'string' ? val.trim() : val)),
  z.string().min(min).max(max).optional()
);

const countryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Country code must be ISO 3166-1 alpha-2');

const uuidSchema = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'A valid operationKey (UUID) is required'
);

// 1. Location Validation
const createLocationSchema = z.object({
  merchantScopeId: optionalTrimmedString(1, 100),
  locationCode: z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/, 'locationCode must be alphanumeric with hyphens or underscores'),
  displayName: z.string().trim().min(2).max(150),
  status: z.enum(['draft', 'active', 'suspended', 'retired']).default('active'),
  countryCode: countryCodeSchema,
  subdivision: optionalTrimmedString(1, 100),
  city: z.string().trim().min(1).max(100),
  postalCode: optionalTrimmedString(1, 30),
  addressLine1: optionalTrimmedString(1, 250),
  addressLine2: optionalTrimmedString(1, 250),
  timeZone: optionalTrimmedString(1, 60).default('Asia/Karachi'),
  priority: z.number().int().min(1).max(1000).default(100),
  supportedMarketCountries: z.array(countryCodeSchema).optional(),
  supportedServiceLevels: z.array(z.string().trim().toLowerCase()).optional(),
  capabilities: z.array(z.string().trim().toLowerCase()).optional(),
  returnCapabilities: z.array(z.string().trim().toLowerCase()).optional(),
  isDefault: z.boolean().optional().default(false)
}).strict();

const updateLocationSchema = z.object({
  displayName: optionalTrimmedString(2, 150),
  status: z.enum(['draft', 'active', 'suspended', 'retired']).optional(),
  subdivision: optionalTrimmedString(1, 100),
  city: optionalTrimmedString(1, 100),
  postalCode: optionalTrimmedString(1, 30),
  addressLine1: optionalTrimmedString(1, 250),
  addressLine2: optionalTrimmedString(1, 250),
  timeZone: optionalTrimmedString(1, 60),
  priority: z.number().int().min(1).max(1000).optional(),
  supportedMarketCountries: z.array(countryCodeSchema).optional(),
  supportedServiceLevels: z.array(z.string().trim().toLowerCase()).optional(),
  capabilities: z.array(z.string().trim().toLowerCase()).optional(),
  returnCapabilities: z.array(z.string().trim().toLowerCase()).optional(),
  isDefault: z.boolean().optional()
}).strict();

const updateLocationStatusSchema = z.object({
  status: z.enum(['draft', 'active', 'suspended', 'retired'])
}).strict();

// 2. Position Controls
const updatePositionControlsSchema = z.object({
  safetyStock: z.number().int().min(0, 'safetyStock must be a non-negative integer').optional(),
  reorderPoint: z.number().int().min(0, 'reorderPoint must be a non-negative integer').optional(),
  allowBackorder: z.boolean().optional(),
  backorderLimit: z.number().int().min(0, 'backorderLimit must be a non-negative integer').optional()
}).strict();

// 3. Stock Adjustment
const adjustStockSchema = z.object({
  productId: objectId,
  variantId: optionalObjectId,
  locationId: optionalObjectId,
  type: z.enum(['in', 'out', 'adjustment']),
  quantity: z.number().int().min(0, 'quantity must be a non-negative integer'),
  reason: z.string().trim().min(3, 'Reason is required and must be at least 3 characters').max(500),
  reference: optionalTrimmedString(1, 200),
  operationKey: uuidSchema
}).strict().refine(
  (data) => {
    if (data.type !== 'adjustment' && data.quantity < 1) {
      return false;
    }
    return true;
  },
  { message: 'Quantity must be at least 1 for in and out adjustments', path: ['quantity'] }
);

// 4. Allocation Preview
const previewAllocationItemSchema = z.object({
  productId: objectId,
  variantId: optionalObjectId,
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(1000),
  sku: optionalTrimmedString(1, 100)
}).strict();

const previewAllocationSchema = z.object({
  items: z.array(previewAllocationItemSchema).min(1, 'At least one item is required'),
  destinationCountry: countryCodeSchema,
  merchantScopeId: optionalTrimmedString(1, 100).default('default'),
  serviceLevel: z.string().trim().toLowerCase().optional().default('standard'),
  allowSplit: z.boolean().optional().default(false),
  maxShipmentGroups: z.number().int().min(1).max(10).optional().default(3)
}).strict();

// 5. Reservation Release
const releaseReservationSchema = z.object({
  reason: optionalTrimmedString(3, 300).default('ADMIN_MANUAL_RELEASE')
}).strict();

// 6. Return Operations
const returnItemSchema = z.object({
  productId: objectId,
  variantId: optionalObjectId,
  inventoryPositionId: optionalObjectId,
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(1000)
}).strict();

const returnReceiptSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  reservationId: optionalObjectId,
  items: z.array(returnItemSchema).min(1, 'At least one return item is required'),
  locationId: optionalObjectId,
  reason: optionalTrimmedString(3, 300).default('CUSTOMER_RETURN')
}).strict();

const returnInspectionSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  reservationId: optionalObjectId,
  items: z.array(returnItemSchema).min(1, 'At least one return item is required'),
  decision: z.enum(['restock', 'quarantine', 'dispose']),
  reason: optionalTrimmedString(3, 300).default('INSPECTION_DECISION')
}).strict();

module.exports = {
  createLocationSchema,
  updateLocationSchema,
  updateLocationStatusSchema,
  updatePositionControlsSchema,
  adjustStockSchema,
  previewAllocationSchema,
  releaseReservationSchema,
  returnReceiptSchema,
  returnInspectionSchema
};

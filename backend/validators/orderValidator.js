const { z } = require('zod');
const mongoose = require('mongoose');
const {
  SUPPORTED_ORDER_PAYMENT_METHODS,
  ORDER_STATUSES,
  ORDER_LIMITS
} = require('../constants/orderConstants');

const objectId = z.string().refine(
  (value) => mongoose.isObjectIdOrHexString(value),
  'A valid MongoDB ObjectId is required'
);

const optionalTrimmed = (schema) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === ''
    ? undefined
    : value,
  schema.optional()
);

const orderItemSchema = z.object({
  productId: objectId,
  variantId: optionalTrimmed(objectId),
  quantity: z.number()
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be at least one')
    .max(
      ORDER_LIMITS.MAX_QUANTITY_PER_LINE,
      `Quantity cannot exceed ${ORDER_LIMITS.MAX_QUANTITY_PER_LINE}`
    )
}).strict();

const createOrderSchema = z.object({
  items: z.array(orderItemSchema)
    .min(1, 'Order must have at least one item')
    .max(
      ORDER_LIMITS.MAX_LINES,
      `Order cannot exceed ${ORDER_LIMITS.MAX_LINES} lines`
    ),
  shippingAddress: z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().trim().regex(
      /^\+?[0-9][0-9 -]{6,19}$/,
      'A valid phone number is required'
    ),
    address: z.string().trim().min(10).max(300),
    addressLine2: optionalTrimmed(z.string().trim().max(200)),
    city: z.string().trim().min(2).max(100),
    province: z.string().trim().min(2).max(100),
    postalCode: optionalTrimmed(
      z.string().trim().min(3).max(20).regex(
        /^[A-Za-z0-9 -]+$/,
        'Postal code contains invalid characters'
      )
    ),
    country: z.string().trim().min(2).max(100)
  }).strict(),
  paymentMethod: z.enum(SUPPORTED_ORDER_PAYMENT_METHODS, {
    message: 'A canonical payment method is required'
  }),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  couponCode: optionalTrimmed(
    z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_-]+$/)
  ),
  customerNote: optionalTrimmed(z.string().trim().max(500))
}).strict().superRefine((value, context) => {
  const seen = new Set();

  value.items.forEach((item, index) => {
    const key = `${item.productId}:${item.variantId || 'default'}`;
    if (seen.has(key)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index],
        message: 'Duplicate product/variant lines are not allowed'
      });
    }
    seen.add(key);
  });
});

const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string()
    .trim()
    .min(8, 'Idempotency-Key must contain at least eight characters')
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, 'Idempotency-Key contains invalid characters')
}).passthrough();

const orderReference = z.string().refine(
  (value) => (
    mongoose.isObjectIdOrHexString(value)
    || /^ORD-\d{8}-[A-F0-9]{12}$/.test(value)
  ),
  'A valid order reference is required'
);

const orderReferenceSchema = z.object({
  id: orderReference
}).strict();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(ORDER_LIMITS.MAX_PAGE_SIZE).default(20),
  status: optionalTrimmed(z.enum(Object.values(ORDER_STATUSES)))
}).passthrough();

const adminOrderQuerySchema = paginationSchema.extend({
  search: optionalTrimmed(z.string().trim().max(100)),
  startDate: optionalTrimmed(z.iso.date()),
  endDate: optionalTrimmed(z.iso.date()),
  sortBy: optionalTrimmed(z.enum([
    'createdAt-desc',
    'createdAt-asc',
    'totalAmount-desc',
    'totalAmount-asc'
  ]))
}).superRefine((value, context) => {
  if (
    value.startDate
    && value.endDate
    && value.startDate > value.endDate
  ) {
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'End date must not be before start date'
    });
  }
});

const updateOrderStatusSchema = z.object({
  orderStatus: z.enum(Object.values(ORDER_STATUSES)),
  adminNote: optionalTrimmed(z.string().trim().max(500))
}).strict();

const updateTrackingSchema = z.object({
  courierCompany: optionalTrimmed(z.string().trim().max(100)),
  trackingNumber: optionalTrimmed(z.string().trim().max(100))
}).strict().refine(
  (value) => Boolean(value.courierCompany || value.trackingNumber),
  'Provide a courier or tracking number'
);

const cancelOrderSchema = z.object({
  reason: optionalTrimmed(z.string().trim().max(500))
}).strict();

module.exports = {
  createOrderSchema,
  idempotencyHeaderSchema,
  orderReferenceSchema,
  paginationSchema,
  adminOrderQuerySchema,
  updateOrderStatusSchema,
  updateTrackingSchema,
  cancelOrderSchema
};

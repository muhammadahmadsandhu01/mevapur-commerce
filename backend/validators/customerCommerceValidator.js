const { z } = require('zod');

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid identifier');
const text = (max, min = 1) => z.string().trim().min(min).max(max);
const optionalText = (max) => z.string().trim().max(max).optional();
const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const pagination = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(50).default(12) }).strict();

const profileSchema = z.object({ fullName: text(100, 3).optional(), phone: optionalText(20), avatar: z.string().trim().url().max(1000).optional() }).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one editable profile field');
const addressBody = z.object({ fullName: text(100), phone: text(20), address: text(300), addressLine2: optionalText(200), city: text(100), province: text(100), postalCode: optionalText(20), country, isDefault: z.boolean().optional() }).strict();
const addressUpdateSchema = addressBody.partial().strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one address field');
const idParam = z.object({ id: objectId }).strict();
const productParam = z.object({ productId: objectId }).strict();
const reviewSubmitSchema = z.object({ productId: objectId, rating: z.number().int().min(1).max(5), title: optionalText(100), comment: text(1000, 5) }).strict();
const reviewUpdateSchema = z.object({ rating: z.number().int().min(1).max(5).optional(), title: optionalText(100), comment: text(1000, 5).optional() }).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one review field');
const orderReference = z.string().trim().regex(/^(?:[a-fA-F0-9]{24}|ORD-[A-Z0-9-]{6,100})$/, 'Invalid order reference');
const returnItemSchema = z.object({ productId: objectId, variantId: objectId.optional(), quantity: z.number().int().min(1).max(20), reason: z.enum(['damaged', 'wrong_item', 'not_as_described', 'not_satisfied', 'duplicate', 'other']), reasonDetails: optionalText(500), images: z.array(z.string().trim().url().max(1000)).max(10).optional(), condition: z.enum(['new', 'used', 'damaged']).optional() }).strict();
const returnRequestSchema = z.object({ orderId: orderReference, items: z.array(returnItemSchema).min(1).max(50), refundMethod: z.enum(['original_payment', 'store_credit', 'bank_transfer']).optional(), customerNotes: optionalText(1000) }).strict();
const returnStatusUpdateSchema = z.object({ status: z.enum(['pending', 'approved', 'received', 'inspected', 'refunded', 'rejected', 'cancelled']), adminNotes: optionalText(1000), rejectedReason: optionalText(1000), trackingNumber: optionalText(100), courierCompany: optionalText(100) }).strict();
const returnRefundSchema = z.object({ adminNotes: optionalText(1000) }).strict();
const returnInventoryReconciliationSchema = z.object({
  action: z.enum(['retry', 'manual_resolve']),
  note: optionalText(500)
}).strict().superRefine((value, context) => {
  if (value.action === 'manual_resolve' && !value.note) {
    context.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'A manual inventory resolution note is required'
    });
  }
});

module.exports = { pagination, profileSchema, addressBody, addressUpdateSchema, idParam, productParam, reviewSubmitSchema, reviewUpdateSchema, returnRequestSchema, returnStatusUpdateSchema, returnRefundSchema, returnInventoryReconciliationSchema };

const mongoose = require('mongoose');
const { z } = require('zod');

const objectId = z.string().refine(
  (value) => mongoose.isObjectIdOrHexString(value),
  'A valid MongoDB ObjectId is required'
);

const paymentProvider = z.enum([
  'cod',
  'bank_transfer',
  'raast',
  'jazzcash',
  'easypaisa',
  'stripe'
]);

const paymentStatus = z.enum([
  'Pending',
  'AwaitingCustomerPayment',
  'AwaitingVerification',
  'Processing',
  'Completed',
  'Rejected',
  'Failed',
  'Expired',
  'Cancelled',
  'PartiallyRefunded',
  'Refunded'
]);

const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string()
    .trim()
    .min(8, 'Idempotency-Key must contain at least eight characters')
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, 'Idempotency-Key contains invalid characters')
}).passthrough();

const createPaymentSchema = z.object({
  orderId: objectId,
  provider: paymentProvider
}).strict();

const paymentReferenceSchema = z.object({
  id: objectId
}).strict();

const orderPaymentReferenceSchema = z.object({
  orderId: objectId
}).strict();

const webhookProviderSchema = z.object({
  provider: z.enum(['stripe', 'jazzcash', 'easypaisa'])
}).strict();

const paymentAvailabilityQuerySchema = z.object({
  country: z.string().trim().min(2).max(100).default('Pakistan'),
  currency: z.literal('PKR').default('PKR'),
  amount: z.coerce.number().finite().positive().max(100000000).optional()
}).passthrough();

const manualPaymentSubmissionSchema = z.object({
  transactionReference: z.string()
    .trim()
    .min(4)
    .max(100)
    .regex(/^[A-Za-z0-9 ._:/-]+$/),
  note: z.string().trim().max(300).optional()
}).strict();

const manualPaymentReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(300).optional()
}).strict();

const codCollectionSchema = z.object({
  note: z.string().trim().max(300).optional()
}).strict();

const createRefundSchema = z.object({
  amount: z.number().finite().positive().max(100000000),
  reason: z.string().trim().min(3).max(200).optional()
}).strict();

const refundReferenceSchema = z.object({
  id: objectId
}).strict();

const refundListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled']).optional()
}).passthrough();

const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  provider: paymentProvider.optional(),
  status: paymentStatus.optional()
}).passthrough();

module.exports = {
  createPaymentSchema,
  createRefundSchema,
  codCollectionSchema,
  idempotencyHeaderSchema,
  manualPaymentReviewSchema,
  manualPaymentSubmissionSchema,
  orderPaymentReferenceSchema,
  paymentAvailabilityQuerySchema,
  paymentListQuerySchema,
  paymentReferenceSchema,
  refundListQuerySchema,
  refundReferenceSchema,
  webhookProviderSchema
};

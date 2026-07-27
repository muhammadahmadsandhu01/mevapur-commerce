const PaymentService = require('../services/payment/PaymentService');
const { logger } = require('../errors/logger');
const { z } = require('zod');

const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  gateway: z.enum(['stripe', 'jazzcash']),
  amount: z.number().positive(),
  currency: z.string().optional().default('PKR')
});

const refundSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().max(200).optional()
});

exports.createPayment = async (req, res, next) => {
  try {
    const validatedData = createPaymentSchema.parse(req.body);
    
    // Generate Idempotency Key from request headers or create new
    const idempotencyKey = req.headers['idempotency-key'] || `${req.user.id}-${validatedData.orderId}-${Date.now()}`;

    const result = await PaymentService.createPaymentSession(
      req.user.id,
      validatedData.orderId,
      validatedData.gateway,
      validatedData.amount,
      validatedData.currency,
      idempotencyKey
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Create payment error', error);
    next(error);
  }
};

exports.handleWebhook = async (req, res) => {
  try {
    const gateway = req.params.gateway;
    const signature = req.headers['stripe-signature'] || req.headers['x-jazzcash-signature'];
    
    // Raw body is needed for signature verification, ensure middleware preserves it
    const rawBody = Buffer.from(JSON.stringify(req.body)); 

    await PaymentService.handleWebhook(gateway, rawBody, signature);

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing error', error);
    // Return 200 anyway to prevent gateway retries for logical errors, unless signature fails
    if (error.code === 'WEBHOOK_VERIFICATION_FAILED') {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    res.status(200).json({ received: true, error: error.message });
  }
};

exports.refundPayment = async (req, res, next) => {
  try {
    const { amount, reason } = refundSchema.parse(req.body);
    const { id } = req.params;

    const payment = await PaymentService.processRefund(id, amount, reason, req.user.id);

    res.json({ success: true, data: payment });
  } catch (error) {
    logger.error('Refund error', error);
    next(error);
  }
};
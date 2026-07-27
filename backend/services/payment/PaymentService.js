const Payment = require('../../models/Payment');
const Order = require('../../models/Order');
const stripeProvider = require('./providers/StripeProvider');
const jazzcashProvider = require('./providers/JazzCashProvider');
const stateMachine = require('./stateMachine/PaymentStateMachine');
const { logger } = require('../../errors/logger');
const { AppError, PaymentError } = require('../../errors/AppError');
const mongoose = require('mongoose');

class PaymentService {
  constructor() {
    this.providers = {
      stripe: stripeProvider,
      jazzcash: jazzcashProvider
      // Add easypaisa, paypal here
    };
  }

  getProvider(gatewayName) {
    const provider = this.providers[gatewayName];
    if (!provider) {
      throw new AppError(`Payment gateway ${gatewayName} not supported`, 400, 'UNSUPPORTED_GATEWAY');
    }
    return provider;
  }

  async createPaymentSession(userId, orderId, gateway, amount, currency = 'PKR', idempotencyKey) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check Idempotency
      const existingPayment = await Payment.findOne({ idempotencyKey }).session(session);
      if (existingPayment) {
        logger.info('Idempotent request received', { idempotencyKey, existingStatus: existingPayment.status });
        return existingPayment;
      }

      const provider = this.getProvider(gateway);
      
      // Verify Order exists and amount matches
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      if (order.user.toString() !== userId) throw new AppError('Unauthorized', 403, 'USER_MISMATCH');
      
      // Create Payment Record
      const paymentDoc = new Payment({
        order: orderId,
        user: userId,
        gateway,
        amount,
        currency,
        idempotencyKey,
        status: 'Pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 mins
      });
      
      await paymentDoc.save({ session });

      // Call Provider
      const providerResponse = await provider.createPayment(amount, currency, orderId, userId, {
        paymentId: paymentDoc._id.toString()
      });

      paymentDoc.paymentIntentId = providerResponse.providerId;
      paymentDoc.providerResponse = providerResponse.rawResponse;
      
      await stateMachine.transition(paymentDoc, providerResponse.status, { source: 'CREATE_SESSION' });

      await session.commitTransaction();
      
      logger.orderEvent('PAYMENT_CREATED', orderId, userId, 'Payment session initialized', {
        gateway,
        amount,
        paymentId: paymentDoc._id
      });

      return {
        paymentId: paymentDoc._id,
        clientSecret: providerResponse.clientSecret, // For frontend Stripe Elements
        redirectUrl: providerResponse.redirectUrl,   // For JazzCash/EasyPaisa
        status: paymentDoc.status
      };

    } catch (error) {
      await session.abortTransaction();
      logger.error('Payment creation failed', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async handleWebhook(gateway, rawBody, signature) {
    const provider = this.getProvider(gateway);
    
    // Verify Signature
    const event = provider.verifyWebhookSignature(rawBody, signature);
    
    // Process Event based on type
    // This logic varies by provider, simplified here for Stripe
    if (gateway === 'stripe') {
      const paymentIntent = event.data.object;
      const payment = await Payment.findOne({ paymentIntentId: paymentIntent.id });
      
      if (!payment) {
        throw new AppError('Payment record not found for webhook', 404, 'PAYMENT_NOT_FOUND');
      }

      const newStatus = provider.mapStatus(paymentIntent.status);
      await stateMachine.transition(payment, newStatus, { 
        source: 'WEBHOOK', 
        eventType: event.type 
      });

      logger.orderEvent('WEBHOOK_PROCESSED', payment.order, payment.user, `Status updated to ${newStatus}`, {
        eventType: event.type,
        paymentId: payment._id
      });

      // Trigger Order Status Update if payment completed
      if (newStatus === 'Completed') {
        await Order.findByIdAndUpdate(payment.order, { 
          paymentStatus: 'Paid',
          paidAt: new Date()
        });
      }
    }

    return { received: true };
  }

  async processRefund(paymentId, amount, reason, userId) {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw new AppError('Payment not found', 404, 'NOT_FOUND');
    if (payment.user.toString() !== userId) throw new AppError('Unauthorized', 403);

    if (!['Completed', 'Captured'].includes(payment.status)) {
      throw new AppError('Cannot refund payment in current status', 400, 'INVALID_REFUND_STATE');
    }

    const provider = this.getProvider(payment.gateway);
    const refundAmount = amount || payment.amount; // Full refund if amount not specified

    await stateMachine.transition(payment, 'RefundPending', { reason, amount: refundAmount });

    try {
      const refundResult = await provider.refundPayment(payment.transactionId || payment.paymentIntentId, refundAmount, reason);
      
      await stateMachine.transition(payment, 'Refunded', {
        refundTxId: refundResult.transactionId,
        refundedAt: new Date()
      });

      payment.refundDetails = {
        amount: refundAmount,
        reason,
        refundedAt: new Date(),
        transactionId: refundResult.transactionId
      };
      await payment.save();

      logger.orderEvent('REFUND_PROCESSED', payment.order, userId, 'Refund successful', {
        amount: refundAmount,
        txId: refundResult.transactionId
      });

      return payment;
    } catch (error) {
      await stateMachine.transition(payment, 'Failed', { reason: error.message, step: 'REFUND' });
      throw error;
    }
  }
}

module.exports = new PaymentService();
const PaymentService = require('../modules/payments/core/PaymentService');
const RefundService = require('../modules/payments/core/RefundService');
const { AppError } = require('../common/errors/AppError');

exports.createPayment = async (req, res, next) => {
  try {
    const result = await PaymentService.createPayment({
      userId: req.auth.userId,
      orderId: req.body.orderId,
      provider: req.body.provider,
      idempotencyKey: req.headers['idempotency-key']
    });

    const statusCode = result.providerOperationPending
      ? 202
      : result.idempotentReplay
        ? 200
        : 201;

    return res.status(statusCode).json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getPayment = async (req, res, next) => {
  try {
    const payment = await PaymentService.getPayment({
      paymentId: req.params.id,
      userId: req.auth.userId,
      role: req.user.role
    });
    return res.json({
      success: true,
      data: { payment },
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getPaymentForOrder = async (req, res, next) => {
  try {
    const payment = await PaymentService.getPaymentForOrder({
      orderId: req.params.orderId,
      userId: req.auth.userId,
      role: req.user.role
    });
    return res.json({
      success: true,
      data: { payment },
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.listPayments = async (req, res, next) => {
  try {
    const result = await PaymentService.listPayments(req.query);
    return res.json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAvailableMethods = async (req, res, next) => {
  try {
    const result = PaymentService.getAvailableMethods(req.query);
    return res.json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getProviderStatuses = async (req, res, next) => {
  try {
    const result = PaymentService.getProviderStatuses(req.query);
    return res.json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.submitManualPayment = async (req, res, next) => {
  try {
    const result = await PaymentService.submitManualPayment({
      paymentId: req.params.id,
      userId: req.auth.userId,
      transactionReference: req.body.transactionReference,
      note: req.body.note
    });
    return res.status(result.idempotentReplay ? 200 : 202).json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.reviewManualPayment = async (req, res, next) => {
  try {
    const result = await PaymentService.reviewManualPayment({
      paymentId: req.params.id,
      adminId: req.auth.userId,
      decision: req.body.decision,
      note: req.body.note,
      requestId: req.requestId
    });
    return res.json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.collectCodPayment = async (req, res, next) => {
  try {
    const result = await PaymentService.collectCodPayment({
      paymentId: req.params.id,
      adminId: req.auth.userId,
      note: req.body.note,
      requestId: req.requestId
    });
    return res.json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.handleWebhook = async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      throw new AppError(
        'Webhook body must be provided as raw bytes',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    const signature = req.headers['stripe-signature']
      || req.headers['x-payment-signature'];
    const result = await PaymentService.handleWebhook(
      req.params.provider,
      req.body,
      signature
    );

    return res.status(200).json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.createRefund = async (req, res, next) => {
  try {
    const result = await RefundService.createRefund({
      paymentId: req.params.id,
      amount: req.body.amount,
      reason: req.body.reason,
      adminId: req.auth.userId,
      idempotencyKey: req.headers['idempotency-key']
    });

    return res.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

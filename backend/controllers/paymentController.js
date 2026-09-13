const PaymentService = require('../modules/payments/core/PaymentService');
const RefundService = require('../modules/payments/core/RefundService');
const { AppError } = require('../common/errors/AppError');

exports.createPayment = async (req, res, next) => {
  try {
    const result = await PaymentService.createPayment({
      userId: req.auth.userId,
      orderId: req.body.orderId,
      provider: req.body.provider,
      returnUrl: req.body.returnUrl,
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
    const result = await PaymentService.getAvailableMethods(req.query);
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
    const result = await PaymentService.getProviderStatuses(req.query);
    return res.json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getOperationalMetrics = async (req, res, next) => {
  try {
    const result = await PaymentService.getOperationalMetrics();
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

const paymentWebhookController = require('./paymentWebhookController');

exports.handleWebhook = paymentWebhookController.handleWebhook;
exports.getWebhookHealth = paymentWebhookController.getWebhookHealth;

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

exports.getPaymentStatus = async (req, res, next) => {
  try {
    const payment = await PaymentService.getPaymentStatus({
      paymentId: req.params.id,
      userId: req.auth.userId,
      role: req.user?.role
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

exports.capturePayment = async (req, res, next) => {
  try {
    const result = await PaymentService.capturePayment({
      paymentId: req.params.id,
      adminId: req.auth.userId,
      amount: req.body.amount,
      idempotencyKey: req.headers['idempotency-key'] || req.body.idempotencyKey,
      requestId: req.requestId
    });
    return res.status(200).json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.cancelPayment = async (req, res, next) => {
  try {
    const result = await PaymentService.cancelPayment({
      paymentId: req.params.id,
      adminId: req.auth.userId,
      reason: req.body.reason,
      idempotencyKey: req.headers['idempotency-key'] || req.body.idempotencyKey,
      requestId: req.requestId
    });
    return res.status(200).json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

exports.voidPayment = async (req, res, next) => {
  try {
    const result = await PaymentService.voidPayment({
      paymentId: req.params.id,
      adminId: req.auth.userId,
      reason: req.body.reason,
      idempotencyKey: req.headers['idempotency-key'] || req.body.idempotencyKey,
      requestId: req.requestId
    });
    return res.status(200).json({
      success: true,
      data: result,
      meta: { requestId: req.requestId || 'unknown' }
    });
  } catch (error) {
    return next(error);
  }
};

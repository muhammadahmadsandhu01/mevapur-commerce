/**
 * Base Application Error Class
 * Ensures consistent error structure across the app
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguishes operational errors from programming bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error (400)
 * Used when Zod/Joi validation fails
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Out of Stock Error (400)
 * Used when inventory is insufficient
 */
class OutOfStockError extends AppError {
  constructor(productName, availableQty, requestedQty) {
    super(
      `Insufficient stock for ${productName}. Available: ${availableQty}, Requested: ${requestedQty}`,
      400,
      'OUT_OF_STOCK'
    );
  }
}

/**
 * Coupon Error (400)
 * Used for invalid/expired coupons
 */
class CouponError extends AppError {
  constructor(message, code = 'COUPON_INVALID') {
    super(message, 400, code);
  }
}

/**
 * Not Found Error (404)
 * Generic resource not found
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Payment Error (402)
 * Used for payment gateway failures
 */
class PaymentError extends AppError {
  constructor(message) {
    super(message, 402, 'PAYMENT_FAILED');
  }
}

/**
 * Unauthorized Error (401)
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

module.exports = {
  AppError,
  ValidationError,
  OutOfStockError,
  CouponError,
  NotFoundError,
  PaymentError,
  UnauthorizedError
};
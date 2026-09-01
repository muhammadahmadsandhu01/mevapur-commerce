const { logger } = require('./logger');
const ERROR_CODES = require('../constants/errorCodes');

// Custom Error Class for API Errors
class ApiError extends Error {
  constructor(
    statusCode,
    message,
    isOperational = true,
    stack = '',
    code = ERROR_CODES.INTERNAL_SERVER_ERROR
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Global Error Handler Middleware
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = typeof err.code === 'string'
    ? err.code
    : ERROR_CODES.INTERNAL_SERVER_ERROR;
  let message = err.isOperational
    ? err.message
    : 'An unexpected server error occurred';
  let details = err.details;

  if (err.name === 'CastError') {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = 'Resource not found';
  }

  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'A resource with that value already exists';
  }

  if (err.name === 'VersionError') {
    statusCode = 409;
    code = 'CONCURRENCY_CONFLICT';
    message = 'This record was modified by another request. Please reload and retry.';
  }

  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Request validation failed';
    details = Object.values(err.errors || {}).map((value) => ({
      field: value.path,
      message: value.message
    }));
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = ERROR_CODES.AUTH_TOKEN_INVALID;
    message = 'Invalid authentication token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = ERROR_CODES.AUTH_TOKEN_EXPIRED;
    message = 'Authentication token has expired';
  }

  logger.error('Request failed', {
    statusCode,
    code,
    method: req.method,
    route: req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : 'unmatched',
    requestId: req.requestId,
    errorName: err.name
  });

  const response = {
    success: false,
    error: {
      code,
      message
    },
    meta: {
      requestId: req.requestId || 'unknown'
    }
  };

  if (Array.isArray(details) && details.length > 0) {
    response.error.details = details;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
module.exports.ApiError = ApiError;

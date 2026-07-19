const { logger } = require('./logger');

// Custom Error Class for API Errors
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational; // True for known errors, false for programming bugs
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Global Error Handler Middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging (using Winston)
  logger.error(`${err.statusCode || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  // Mongoose Bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new ApiError(404, message);
  }

  // Mongoose Duplicate Key (Unique Field)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = new ApiError(400, message);
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ApiError(400, message);
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ApiError(401, message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ApiError(401, message);
  }

  // Send Response
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    // In development, send stack trace
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    // In development, send detailed error info
    errorDetails: process.env.NODE_ENV === 'development' ? err.errors : undefined
  });
};

module.exports = errorHandler;
module.exports.ApiError = ApiError;
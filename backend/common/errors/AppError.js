const errorCodes = require('../../constants/errorCodes');

class AppError extends Error {
  constructor(message, statusCode, code, details = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || errorCodes.INTERNAL_SERVER_ERROR;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class AuthenticationError extends AppError {
  constructor(message, code = errorCodes.AUTH_INVALID_CREDENTIALS) {
    super(message, 401, code);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Forbidden', code = errorCodes.AUTH_PERMISSION_DENIED) {
    super(message, 403, code);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 400, errorCodes.VALIDATION_ERROR, details);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

module.exports = {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
};
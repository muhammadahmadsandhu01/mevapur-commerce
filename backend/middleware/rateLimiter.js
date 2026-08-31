const rateLimit = require('express-rate-limit');

// Dedicated rate limiter for forgot-password: max 5 attempts per 15 minutes.
// Returns the identical generic success message and 200 status code to prevent enumeration.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  statusCode: 200,
  message: {
    success: true,
    message: 'If an account exists with this email, a reset link has been sent'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Dedicated rate limiter for reset-password: max 5 attempts per 15 minutes.
// Returns neutral 429 status code to prevent brute-forcing token validity.
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  statusCode: 429,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  forgotPasswordLimiter,
  resetPasswordLimiter
};
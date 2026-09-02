const express = require('express');
const {
  register,
  login,
  refresh,
  getCsrfToken,
  getMe,
  logout,
  logoutAll,
  getSessions,
  revokeSession,
  forgotPassword,
  resetPassword,
  changePassword
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');
const { limiter } = require('../middleware/security');
const ERROR_CODES = require('../constants/errorCodes');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema
} = require('../validators/authValidator');
const { revokeSessionSchema } = require('../validators/sessionValidator');

const { forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const authValidation = (schema, source = 'body') => validate(schema, {
  source,
  code: ERROR_CODES.AUTH_VALIDATION_FAILED
});

router.get('/csrf-token', getCsrfToken);

router.post(
  '/register',
  limiter,
  authValidation(registerSchema),
  register
);

router.post(
  '/login',
  limiter,
  authValidation(loginSchema),
  login
);

router.post(
  '/refresh',
  csrfProtection,
  refresh
);

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  authValidation(forgotPasswordSchema),
  forgotPassword
);

router.post(
  '/reset-password',
  resetPasswordLimiter,
  authValidation(resetPasswordSchema),
  resetPassword
);

router.get(
  '/me',
  protect,
  getMe
);

router.post(
  '/logout',
  csrfProtection,
  protect,
  logout
);

router.post(
  '/logout-all',
  csrfProtection,
  protect,
  logoutAll
);

router.get(
  '/sessions',
  protect,
  getSessions
);

router.delete(
  '/sessions/:sessionId',
  csrfProtection,
  protect,
  authValidation(revokeSessionSchema, 'params'),
  revokeSession
);

router.post(
  '/change-password',
  csrfProtection,
  protect,
  authValidation(changePasswordSchema),
  changePassword
);

// Multi-Factor Authentication (MFA)
router.post(
  '/mfa/verify',
  limiter,
  require('../controllers/authController').verifyMfa
);

router.post(
  '/mfa/setup',
  csrfProtection,
  protect,
  require('../controllers/authController').setupMfa
);

router.post(
  '/mfa/confirm',
  csrfProtection,
  protect,
  require('../controllers/authController').confirmMfa
);

router.post(
  '/mfa/disable',
  csrfProtection,
  protect,
  require('../controllers/authController').disableMfa
);

router.post(
  '/mfa/regenerate-recovery-codes',
  csrfProtection,
  protect,
  require('../controllers/authController').regenerateRecoveryCodes
);

// Staff Invitation Acceptance
router.post(
  '/accept-invitation',
  limiter,
  require('../controllers/authController').acceptInvitation
);

module.exports = router;

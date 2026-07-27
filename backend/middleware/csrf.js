const csrf = require('csurf');
const config = require('../config/security.config');

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    path: '/'
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'] // Only protect state-changing methods
});

const csrfErrorHandler = (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_CSRF_INVALID',
        message: 'Invalid CSRF token. Please refresh the page.'
      }
    });
  }
  next(err);
};

module.exports = { csrfProtection, csrfErrorHandler };
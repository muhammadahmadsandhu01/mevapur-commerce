const crypto = require('crypto');
const config = require('../config/auth.config');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');
const { getRuntimeConfig } = require('../config/runtime.config');

const runtimeConfig = getRuntimeConfig();

const signNonce = (nonce) => crypto
  .createHmac('sha256', config.security.csrfSecret)
  .update(nonce, 'utf8')
  .digest('hex');

const createCsrfToken = () => {
  const nonce = crypto.randomBytes(32).toString('hex');
  return `${nonce}.${signNonce(nonce)}`;
};

const safeEqual = (left, right) => {
  if (
    typeof left !== 'string'
    || typeof right !== 'string'
    || left.length !== right.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(left, 'utf8'),
    Buffer.from(right, 'utf8')
  );
};

const isSignedTokenValid = (token) => {
  if (typeof token !== 'string') return false;
  const [nonce, signature, extra] = token.split('.');
  if (extra || !nonce || !signature || !/^[a-f0-9]{64}$/.test(nonce)) {
    return false;
  }
  return safeEqual(signature, signNonce(nonce));
};

const issueCsrfToken = (res) => {
  const token = createCsrfToken();
  res.cookie(config.cookie.csrf.name, token, config.cookie.csrf);
  return token;
};

const clearCsrfToken = (res) => {
  const { maxAge, ...options } = config.cookie.csrf;
  res.clearCookie(config.cookie.csrf.name, options);
};

const csrfProtection = (req, res, next) => {
  const cookieToken = req.cookies?.[config.cookie.csrf.name];
  const headerToken = req.get('X-CSRF-Token');
  const requestOrigin = req.get('Origin');

  if (
    (
      requestOrigin
        ? !runtimeConfig.csrf.isAllowedOrigin(requestOrigin)
        : runtimeConfig.csrf.requireOrigin
    )
    ||
    !isSignedTokenValid(cookieToken)
    || !safeEqual(cookieToken, headerToken)
  ) {
    return next(
      new AppError(
        'Invalid CSRF token',
        403,
        ERROR_CODES.AUTH_CSRF_INVALID
      )
    );
  }

  return next();
};

module.exports = {
  csrfProtection,
  issueCsrfToken,
  clearCsrfToken,
  isSignedTokenValid
};

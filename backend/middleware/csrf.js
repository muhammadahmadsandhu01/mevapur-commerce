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

const getCsrfCookieName = (req) => {
  const scope = (req?.get?.('X-Auth-Scope') || req?.get?.('X-Client-App') || '').toLowerCase().trim();
  if (scope === 'storefront') return 'mevapur_storefront_csrf';
  if (scope === 'admin') return 'mevapur_admin_csrf';

  const origin = req?.get?.('Origin') || req?.get?.('Referer') || '';
  if (origin.includes(':55070') || origin.includes(':3000')) return 'mevapur_storefront_csrf';
  if (origin.includes(':55071') || origin.includes(':3001')) return 'mevapur_admin_csrf';

  return config.cookie.csrf.name;
};

const issueCsrfToken = (reqOrRes, maybeRes) => {
  const res = maybeRes || reqOrRes;
  const req = maybeRes ? reqOrRes : null;
  const token = createCsrfToken();
  const cookieName = getCsrfCookieName(req);
  res.cookie(cookieName, token, config.cookie.csrf);
  if (cookieName !== config.cookie.csrf.name) {
    res.cookie(config.cookie.csrf.name, token, config.cookie.csrf);
  }
  return token;
};

const clearCsrfToken = (reqOrRes, maybeRes) => {
  const res = maybeRes || reqOrRes;
  const req = maybeRes ? reqOrRes : null;
  const { maxAge, ...options } = config.cookie.csrf;
  const cookieName = getCsrfCookieName(req);
  res.clearCookie(cookieName, options);
  res.clearCookie(config.cookie.csrf.name, options);
  res.clearCookie('mevapur_storefront_csrf', options);
  res.clearCookie('mevapur_admin_csrf', options);
};

const csrfProtection = (req, res, next) => {
  const cookieName = getCsrfCookieName(req);
  const cookieToken = req.cookies?.[cookieName] || req.cookies?.[config.cookie.csrf.name];
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
  isSignedTokenValid,
  getCsrfCookieName
};

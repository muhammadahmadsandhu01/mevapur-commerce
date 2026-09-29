const AuthService = require('../services/AuthService');
const config = require('../config/auth.config');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');
const {
  issueCsrfToken,
  clearCsrfToken
} = require('../middleware/csrf');

const getClientInfo = (req) => ({
  ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
  userAgent: (req.get('User-Agent') || 'unknown').slice(0, 500),
  requestId: req.requestId || 'unknown'
});

const getDeviceInfo = (req) => {
  const userAgent = (req.get('User-Agent') || 'Unknown Device').slice(0, 200);
  return {
    deviceId: (req.get('X-Device-ID') || '').slice(0, 128) || undefined,
    deviceName: userAgent,
    browser: 'Unknown',
    os: 'Unknown'
  };
};

const success = (req, res, statusCode, message, data) => {
  const body = {
    success: true,
    message,
    meta: {
      requestId: req.requestId || 'unknown'
    }
  };

  if (data !== undefined) body.data = data;
  return res.status(statusCode).json(body);
};

const getAuthScope = (req) => {
  const explicitScope = (req?.get?.('X-Auth-Scope') || req?.get?.('X-Client-App') || '').toLowerCase().trim();
  if (explicitScope === 'storefront') return 'storefront';
  if (explicitScope === 'admin') return 'admin';

  const origin = req?.get?.('Origin') || req?.get?.('Referer') || '';
  if (origin.includes(':55070') || origin.includes(':3000')) return 'storefront';
  if (origin.includes(':55071') || origin.includes(':3001')) return 'admin';

  return 'generic';
};

const getRefreshCookieName = (req) => {
  const scope = getAuthScope(req);
  if (scope === 'storefront') return 'mevapur_storefront_token';
  if (scope === 'admin') return 'mevapur_admin_token';
  return config.cookie.refresh.name;
};

const setRefreshCookie = (reqOrRes, maybeResOrToken, maybeToken) => {
  const res = maybeToken !== undefined ? maybeResOrToken : (maybeResOrToken && maybeResOrToken.cookie ? maybeResOrToken : reqOrRes);
  const req = maybeToken !== undefined ? reqOrRes : (maybeResOrToken && maybeResOrToken.cookie ? reqOrRes : null);
  const refreshToken = maybeToken !== undefined ? maybeToken : maybeResOrToken;

  const cookieName = getRefreshCookieName(req);
  res.cookie(
    cookieName,
    refreshToken,
    config.cookie.refresh
  );
  if (cookieName !== config.cookie.refresh.name) {
    res.cookie(
      config.cookie.refresh.name,
      refreshToken,
      config.cookie.refresh
    );
  }
};

const clearAuthCookies = (reqOrRes, maybeRes) => {
  const res = maybeRes || reqOrRes;
  const req = maybeRes ? reqOrRes : null;
  const { maxAge: refreshMaxAge, ...refreshOptions } = config.cookie.refresh;
  const cookieName = getRefreshCookieName(req);
  res.clearCookie(cookieName, refreshOptions);
  res.clearCookie('mevapur_storefront_token', refreshOptions);
  res.clearCookie('mevapur_admin_token', refreshOptions);
  res.clearCookie(config.cookie.refresh.name, refreshOptions);
  clearCsrfToken(req, res);
};

exports.getCsrfToken = (req, res) => {
  const csrfToken = issueCsrfToken(req, res);
  const cookieName = getRefreshCookieName(req);
  const scope = getAuthScope(req);
  const hasRefreshSession = Boolean(
    req.cookies?.[cookieName] || (scope === 'generic' && req.cookies?.[config.cookie.refresh.name])
  );
  return success(req, res, 200, 'CSRF token issued', {
    csrfToken,
    hasRefreshSession
  });
};

exports.register = async (req, res, next) => {
  try {
    const { phone, residenceCountry, ...rest } = req.body;
    const effectiveResidenceCountry = (residenceCountry && typeof residenceCountry === 'string' && residenceCountry.trim())
      ? residenceCountry.trim().toUpperCase()
      : 'PK';

    const result = await AuthService.register({
      ...rest,
      phone: (phone || '').trim(),
      residenceCountry: effectiveResidenceCountry,
      ...getClientInfo(req),
      deviceInfo: getDeviceInfo(req)
    });

    if (result.requiresEmailVerification) {
      const message = result.emailDeliveryFailed
        ? 'Account registered, but the verification email could not be sent. Please use resend verification.'
        : 'Registration successful. Please check your email to verify your account.';

      return success(req, res, 201, message, {
        user: result.user,
        requiresEmailVerification: true,
        emailDeliveryFailed: Boolean(result.emailDeliveryFailed)
      });
    }

    const csrfToken = issueCsrfToken(req, res);
    setRefreshCookie(req, res, result.refreshToken);

    return success(req, res, 201, 'Registration successful', {
      user: result.user,
      requiresEmailVerification: false,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      csrfToken
    });
  } catch (error) {
    return next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const result = await AuthService.verifyEmail({
      token: req.body.token,
      ...getClientInfo(req)
    });
    return success(req, res, 200, 'Email verified successfully', result);
  } catch (error) {
    return next(error);
  }
};

exports.resendVerification = async (req, res, next) => {
  try {
    const result = await AuthService.resendVerification({
      email: req.body.email,
      redirect: req.body.redirect,
      ...getClientInfo(req)
    });
    return success(
      req,
      res,
      200,
      'If an account exists with this email, a verification link has been sent',
      result
    );
  } catch (error) {
    return next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const result = await AuthService.login({
      ...req.body,
      ...getClientInfo(req),
      deviceInfo: getDeviceInfo(req)
    });

    if (result.mfaRequired) {
      return success(req, res, 200, 'MFA verification required', {
        mfaRequired: true,
        mfaToken: result.mfaToken,
        user: result.user
      });
    }

    const csrfToken = issueCsrfToken(req, res);
    setRefreshCookie(req, res, result.refreshToken);

    return success(req, res, 200, 'Login successful', {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      csrfToken
    });
  } catch (error) {
    return next(error);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const cookieName = getRefreshCookieName(req);
    const scope = getAuthScope(req);
    let refreshToken = req.cookies?.[cookieName];
    if (!refreshToken && scope === 'generic') {
      refreshToken = req.cookies?.[config.cookie.refresh.name];
    }

    if (!refreshToken) {
      clearAuthCookies(req, res);
      return next(new AppError('Refresh token is required', 401, ERROR_CODES.AUTH_TOKEN_REQUIRED));
    }

    const result = await AuthService.refreshTokens({
      refreshToken,
      ...getClientInfo(req)
    });
    const csrfToken = issueCsrfToken(req, res);
    setRefreshCookie(req, res, result.refreshToken);

    return success(req, res, 200, 'Authentication refreshed', {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      csrfToken
    });
  } catch (error) {
    clearAuthCookies(req, res);
    return next(error);
  }
};

exports.getMe = (req, res) => success(
  req,
  res,
  200,
  'Current user retrieved',
  { user: req.user }
);

exports.logout = async (req, res, next) => {
  try {
    await AuthService.logout({
      userId: req.auth.userId,
      sessionId: req.auth.sessionId,
      ...getClientInfo(req)
    });
    clearAuthCookies(req, res);
    return success(req, res, 200, 'Logout successful');
  } catch (error) {
    return next(error);
  }
};

exports.logoutAll = async (req, res, next) => {
  try {
    const result = await AuthService.logoutAll({
      userId: req.auth.userId,
      ...getClientInfo(req)
    });
    clearAuthCookies(res);
    return success(req, res, 200, 'All sessions revoked', {
      sessionsRevoked: result.sessionsRevoked
    });
  } catch (error) {
    return next(error);
  }
};

exports.getSessions = async (req, res, next) => {
  try {
    const sessions = await AuthService.getSessions({
      userId: req.auth.userId,
      currentSessionId: req.auth.sessionId
    });
    return success(req, res, 200, 'Active sessions retrieved', { sessions });
  } catch (error) {
    return next(error);
  }
};

exports.revokeSession = async (req, res, next) => {
  try {
    const result = await AuthService.revokeSession({
      sessionId: req.params.sessionId,
      userId: req.auth.userId,
      currentSessionId: req.auth.sessionId,
      ...getClientInfo(req)
    });
    if (result.revokedCurrent) clearAuthCookies(res);
    return success(req, res, 200, 'Session revoked', result);
  } catch (error) {
    return next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    await AuthService.forgotPassword({
      email: req.body.email,
      ...getClientInfo(req)
    });
    return success(
      req,
      res,
      200,
      'If an account exists with this email, a reset link has been sent'
    );
  } catch (error) {
    return next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    await AuthService.resetPassword({
      ...req.body,
      ...getClientInfo(req)
    });
    clearAuthCookies(res);
    return success(req, res, 200, 'Password reset successful');
  } catch (error) {
    return next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    await AuthService.changePassword({
      userId: req.auth.userId,
      ...req.body,
      ...getClientInfo(req)
    });
    clearAuthCookies(res);
    return success(req, res, 200, 'Password changed successfully');
  } catch (error) {
    return next(error);
  }
};

exports.verifyMfa = async (req, res, next) => {
  try {
    const result = await AuthService.verifyMfaLogin({
      ...req.body,
      ...getClientInfo(req),
      deviceInfo: getDeviceInfo(req)
    });
    const csrfToken = issueCsrfToken(res);
    setRefreshCookie(res, result.refreshToken);

    return success(req, res, 200, 'MFA verification successful', {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      csrfToken
    });
  } catch (error) {
    return next(error);
  }
};

exports.setupMfa = async (req, res, next) => {
  try {
    const result = await AuthService.setupMfa({
      userId: req.auth.userId,
      ...getClientInfo(req)
    });
    return success(req, res, 200, 'MFA setup initiated', result);
  } catch (error) {
    return next(error);
  }
};

exports.confirmMfa = async (req, res, next) => {
  try {
    const result = await AuthService.confirmMfa({
      userId: req.auth.userId,
      code: req.body.code,
      ...getClientInfo(req)
    });
    return success(req, res, 200, 'MFA successfully enabled and enrolled', result);
  } catch (error) {
    return next(error);
  }
};

exports.disableMfa = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.auth.userId;
    const result = await AuthService.disableMfa({
      userId: targetUserId,
      password: req.body.password,
      code: req.body.code,
      currentUserId: req.auth.userId,
      currentUserRole: req.user.role,
      ...getClientInfo(req)
    });
    if (String(targetUserId) === String(req.auth.userId)) {
      clearAuthCookies(res);
    }
    return success(req, res, 200, 'MFA disabled successfully', result);
  } catch (error) {
    return next(error);
  }
};

exports.regenerateRecoveryCodes = async (req, res, next) => {
  try {
    const result = await AuthService.regenerateRecoveryCodes({
      userId: req.auth.userId,
      password: req.body.password,
      code: req.body.code,
      ...getClientInfo(req)
    });
    return success(req, res, 200, 'Recovery codes regenerated', result);
  } catch (error) {
    return next(error);
  }
};

exports.acceptInvitation = async (req, res, next) => {
  try {
    const result = await AuthService.acceptInvitation({
      ...req.body,
      ...getClientInfo(req),
      deviceInfo: getDeviceInfo(req)
    });
    const csrfToken = issueCsrfToken(res);
    setRefreshCookie(res, result.refreshToken);

    return success(req, res, 201, 'Invitation accepted successfully', {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      csrfToken
    });
  } catch (error) {
    return next(error);
  }
};

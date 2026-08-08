const TokenService = require('../services/TokenService');
const UserRepository = require('../repositories/UserRepository');
const SessionRepository = require('../repositories/SessionRepository');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

/*
|--------------------------------------------------------------------------
| Authenticate User
|--------------------------------------------------------------------------
*/

exports.protect = async (req, res, next) => {
  try {
    const authorization = req.get('Authorization');
    const match = typeof authorization === 'string'
      ? authorization.match(/^Bearer\s+(.+)$/i)
      : null;

    if (!match) {
      throw new AppError(
        'Authentication token is required',
        401,
        ERROR_CODES.AUTH_TOKEN_REQUIRED
      );
    }

    const decoded = TokenService.verifyAccessToken(match[1]);
    const [user, session] = await Promise.all([
      UserRepository.findByIdWithTokenVersion(decoded.sub),
      SessionRepository.findById(decoded.sid)
    ]);

    if (!user || user.isDeleted) {
      throw new AppError(
        'Authentication account is unavailable',
        401,
        ERROR_CODES.AUTH_ACCOUNT_INACTIVE
      );
    }

    if (user.isBlocked) {
      throw new AppError(
        'Account has been blocked',
        403,
        ERROR_CODES.AUTH_ACCOUNT_BLOCKED
      );
    }

    if (Number(user.tokenVersion) !== decoded.tokenVersion) {
      throw new AppError(
        'Authentication token has been invalidated',
        401,
        ERROR_CODES.AUTH_TOKEN_VERSION_MISMATCH
      );
    }

    if (!session) {
      throw new AppError(
        'Authentication session was not found',
        401,
        ERROR_CODES.AUTH_SESSION_NOT_FOUND
      );
    }

    if (String(session.user) !== String(user._id)) {
      throw new AppError(
        'Invalid authentication session',
        401,
        ERROR_CODES.AUTH_TOKEN_INVALID
      );
    }

    if (!session.isActive || session.isRevoked) {
      throw new AppError(
        'Authentication session has been revoked',
        401,
        ERROR_CODES.AUTH_SESSION_REVOKED
      );
    }

    if (session.expiresAt <= new Date()) {
      throw new AppError(
        'Authentication session has expired',
        401,
        ERROR_CODES.AUTH_SESSION_EXPIRED
      );
    }

    const safeUser = user.toJSON();
    req.auth = {
      userId: String(user._id),
      sessionId: String(session._id),
      tokenVersion: decoded.tokenVersion,
      tokenId: decoded.jti
    };
    req.user = safeUser;
    return next();
  } catch (error) {
    return next(error);
  }
};

/*
|--------------------------------------------------------------------------
| Admin Only
|--------------------------------------------------------------------------
*/

exports.admin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError(
      'Authentication is required',
      401,
      ERROR_CODES.AUTH_TOKEN_REQUIRED
    ));
  }

  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return next(new AppError(
      'Admin access is required',
      403,
      ERROR_CODES.AUTH_FORBIDDEN
    ));
  }

  return next();
};

/*
|--------------------------------------------------------------------------
| Super Admin Only
|--------------------------------------------------------------------------
*/

exports.superAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError(
      'Authentication is required',
      401,
      ERROR_CODES.AUTH_TOKEN_REQUIRED
    ));
  }

  if (req.user.role !== 'super_admin') {
    return next(new AppError(
      'Super Admin access is required',
      403,
      ERROR_CODES.AUTH_FORBIDDEN
    ));
  }

  return next();
};

/*
|--------------------------------------------------------------------------
| Dynamic Role Authorization
|--------------------------------------------------------------------------
*/

exports.checkRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError(
        'Authentication is required',
        401,
        ERROR_CODES.AUTH_TOKEN_REQUIRED
      ));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(
        'Access is not permitted for this account',
        403,
        ERROR_CODES.AUTH_FORBIDDEN
      ));
    }

    return next();
  };
};

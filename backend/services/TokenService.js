const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const config = require('../config/auth.config');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

class TokenService {
  generateAccessToken({ userId, sessionId, tokenVersion = 0 }) {
    const payload = {
      sub: String(userId),
      sid: String(sessionId),
      jti: uuidv4(),
      tokenVersion: Number(tokenVersion),
      type: 'access'
    };

    return jwt.sign(payload, config.jwt.secret, {
      algorithm: 'HS256',
      expiresIn: config.jwt.accessExpiry,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    });
  }

  generateRefreshToken({
    userId,
    sessionId,
    tokenVersion = 0,
    tokenFamilyId
  }) {
    const payload = {
      sub: String(userId),
      sid: String(sessionId),
      jti: uuidv4(),
      tokenVersion: Number(tokenVersion),
      tokenFamilyId,
      type: 'refresh'
    };

    return jwt.sign(payload, config.jwt.secret, {
      algorithm: 'HS256',
      expiresIn: config.jwt.refreshExpiry,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    });
  }

  generateMfaToken({ userId, email, role }) {
    const payload = {
      sub: String(userId),
      email,
      role,
      jti: uuidv4(),
      type: 'mfa_challenge'
    };

    return jwt.sign(payload, config.jwt.secret, {
      algorithm: 'HS256',
      expiresIn: '5m',
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    });
  }

  verifyMfaToken(token) {
    if (!token || typeof token !== 'string') {
      throw new AppError(
        'MFA verification token is required',
        401,
        ERROR_CODES.AUTH_TOKEN_REQUIRED
      );
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: ['HS256'],
        issuer: config.jwt.issuer,
        audience: config.jwt.audience
      });

      if (decoded.type !== 'mfa_challenge' || !decoded.sub) {
        throw new AppError(
          'Invalid MFA verification token',
          401,
          ERROR_CODES.AUTH_TOKEN_INVALID
        );
      }

      return decoded;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error.name === 'TokenExpiredError') {
        throw new AppError(
          'MFA challenge has expired. Please log in again',
          401,
          ERROR_CODES.AUTH_TOKEN_EXPIRED
        );
      }
      throw new AppError(
        'Invalid MFA verification token',
        401,
        ERROR_CODES.AUTH_TOKEN_INVALID
      );
    }
  }

  verifyToken(token, expectedType) {
    if (!token || typeof token !== 'string') {
      throw new AppError(
        'Authentication token is required',
        401,
        ERROR_CODES.AUTH_TOKEN_REQUIRED
      );
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: ['HS256'],
        issuer: config.jwt.issuer,
        audience: config.jwt.audience
      });

      if (
        decoded.type !== expectedType
        || !decoded.sub
        || !decoded.sid
        || !Number.isInteger(decoded.tokenVersion)
      ) {
        throw new AppError(
          'Invalid authentication token',
          401,
          ERROR_CODES.AUTH_TOKEN_INVALID
        );
      }

      if (expectedType === 'refresh' && !decoded.tokenFamilyId) {
        throw new AppError(
          'Invalid authentication token',
          401,
          ERROR_CODES.AUTH_TOKEN_INVALID
        );
      }

      return decoded;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error.name === 'TokenExpiredError') {
        throw new AppError(
          'Authentication token has expired',
          401,
          ERROR_CODES.AUTH_TOKEN_EXPIRED
        );
      }

      if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
        throw new AppError(
          'Invalid authentication token',
          401,
          ERROR_CODES.AUTH_TOKEN_INVALID
        );
      }

      throw new AppError(
        'Authentication token verification failed',
        401,
        ERROR_CODES.AUTH_TOKEN_INVALID
      );
    }
  }

  verifyAccessToken(token) {
    return this.verifyToken(token, 'access');
  }

  verifyRefreshToken(token) {
    return this.verifyToken(token, 'refresh');
  }

  getAccessTokenExpiry() {
    return config.jwt.accessExpiry;
  }
}

module.exports = new TokenService();

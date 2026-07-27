const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/auth.config');
const { AppError } = require('../common/errors/AppError');
const { ERROR_CODES } = require('../constants/errorCodes');
const User = require('../models/User');

class TokenService {
  generateAccessToken(userId, sessionId, tokenVersion = 0) {
    const payload = {
      sub: userId,
      sid: sessionId,
      jti: uuidv4(),
      ver: tokenVersion,
      type: 'access'
    };

    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.accessTokenExpiry,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    });
  }

  generateRefreshToken(userId, sessionId, tokenVersion = 0) {
    const payload = {
      sub: userId,
      sid: sessionId,
      jti: uuidv4(),
      ver: tokenVersion,
      type: 'refresh'
    };

    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.refreshTokenExpiry,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience
    });
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, config.jwtSecret, {
        issuer: config.jwtIssuer,
        audience: config.jwtAudience
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Token has expired', 401, ERROR_CODES.AUTH_TOKEN_EXPIRED);
      }
      if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
        throw new AppError('Invalid token', 401, ERROR_CODES.AUTH_TOKEN_INVALID);
      }
      // Fallback for any other JWT error
      throw new AppError('Token verification failed', 401, ERROR_CODES.AUTH_TOKEN_INVALID);
    }
  }

  async rotateToken(userId, session = null) {
    // Build query with session support if provided
    let query = User.findById(userId);
    if (session) query = query.session(session);
    
    const user = await query.exec();
    
    if (!user) {
      throw new AppError('User not found', 404, ERROR_CODES.USER_NOT_FOUND);
    }

    user.tokenVersion += 1;
    
    // Mock-friendly save check
    if (typeof user.save === 'function') {
      await user.save({ session });
    } else {
      // Fallback for plain objects in tests if save is missing
      await User.findByIdAndUpdate(user._id, { tokenVersion: user.tokenVersion }, { session, new: true });
    }
    
    return user.tokenVersion;
  }
}

module.exports = new TokenService();
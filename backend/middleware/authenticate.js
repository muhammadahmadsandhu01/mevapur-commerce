const jwt = require('jsonwebtoken');
const UserRepository = require('../repositories/UserRepository');
const SessionRepository = require('../repositories/SessionRepository');
const config = require('../config/auth.config');
const { AppError } = require('../errors/AppError');

const authenticate = async (req, res, next) => {
  try {
    let token;

    // Check Headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // Check Cookies
    else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new AppError('Authentication required', 401, 'AUTH_TOKEN_MISSING');
    }

    // Verify Token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Check Token Version (Rotation Security)
    const user = await UserRepository.findById(decoded.sub);
    if (!user || user.tokenVersion !== decoded.ver) {
      throw new AppError('Token invalidated due to security update', 401, 'AUTH_TOKEN_INVALID');
    }

    // Check Session Existence (if session based)
    if (decoded.sid) {
      const session = await SessionRepository.findById(decoded.sid);
      if (!session || session.isRevoked || session.expiresAt < new Date()) {
        throw new AppError('Session expired or revoked', 401, 'AUTH_SESSION_INVALID');
      }
    }

    // Attach User to Request (Lean object for performance)
    req.user = {
      _id: user._id,
      email: user.email,
      role: user.role,
      isBlocked: user.isBlocked
    };

    if (req.user.isBlocked) {
      throw new AppError('Account blocked', 403, 'AUTH_ACCOUNT_BLOCKED');
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401, 'AUTH_TOKEN_INVALID'));
    }
    next(error);
  }
};

module.exports = authenticate;
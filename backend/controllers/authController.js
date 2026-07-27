const User = require('../models/User');
const AuthService = require('../services/AuthService');
const AuditService = require('../services/AuditService');
const { validationResult } = require('express-validator');
const { logger } = require('../middleware/logger');
const config = require('../config/auth.config');

/*
|--------------------------------------------------------------------------
| Helper: Get Client Info for Logging & Audit
|--------------------------------------------------------------------------
*/
const getClientInfo = (req) => ({
  ip: req.ip || req.connection.remoteAddress || 'unknown',
  userAgent: req.get('User-Agent') || 'unknown',
  requestId: req.get('X-Request-ID') || 'unknown'
});

/*
|--------------------------------------------------------------------------
| Register New User
|--------------------------------------------------------------------------
| - Validates input via express-validator (middleware)
| - Calls AuthService for business logic
| - Logs audit event
| - Returns standardized response
*/
exports.register = async (req, res, next) => {
  try {
    // 1. Validation Check (from middleware)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'AUTH_VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      });
    }

    const { fullName, email, password, phone } = req.body;
    const clientInfo = getClientInfo(req);

    // 2. Call Service Layer
    const result = await AuthService.register({
      fullName,
      email,
      password,
      phone,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

    // 3. Audit Log
    await AuditService.log({
      requestId: clientInfo.requestId,
      userId: result.user._id,
      action: 'AUTH.REGISTER',
      status: 'SUCCESS',
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      metadata: { email: result.user.email }
    });

    // 4. Standardized Response
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: result
    });

  } catch (error) {
    logger.error(`Registration Error: ${error.message}`, error.stack);
    
    // Audit failure
    await AuditService.log({
      requestId: req.get('X-Request-ID') || 'unknown',
      userId: null,
      action: 'AUTH.REGISTER',
      status: 'FAILURE',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      errorMessage: error.message
    });

    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'SERVER_ERROR',
        message: error.isOperational ? error.message : 'Registration failed due to server error.'
      }
    });
  }
};

/*
|--------------------------------------------------------------------------
| Login User
|--------------------------------------------------------------------------
| - Validates credentials
| - Handles account lockout & brute-force protection
| - Creates session
| - Returns HttpOnly cookies (if configured) or token
*/
exports.login = async (req, res, next) => {
  try {
    // 1. Validation Check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'AUTH_VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      });
    }

    const { email, password } = req.body;
    const clientInfo = getClientInfo(req);

    // 2. Call Service Layer
    const result = await AuthService.login({
      email,
      password,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      requestId: clientInfo.requestId
    });

    // 3. Audit Log
    await AuditService.log({
      requestId: clientInfo.requestId,
      userId: result.user._id,
      action: 'AUTH.LOGIN.SUCCESS',
      status: 'SUCCESS',
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      metadata: { sessionId: result.session._id }
    });

    // 4. Set Cookies (if enabled)
    if (config.cookies.enabled) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: config.cookies.secure,
        sameSite: config.cookies.sameSite,
        maxAge: config.cookies.refreshExpiry * 1000,
        path: '/api/v1/auth/refresh'
      });

      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: config.cookies.secure,
        sameSite: config.cookies.sameSite,
        maxAge: config.cookies.accessExpiry * 1000,
        path: '/'
      });
    }

    // 5. Standardized Response
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        sessionId: result.session._id,
        ...(config.cookies.enabled ? {} : { accessToken: result.accessToken, refreshToken: result.refreshToken })
      }
    });

  } catch (error) {
    logger.error(`Login Error: ${error.message}`, error.stack);

    // Attempt to find user for audit (even on failure)
    let userId = null;
    try {
      const user = await User.findOne({ email: req.body.email }).select('_id');
      if (user) userId = user._id;
    } catch (e) { /* Ignore */ }

    await AuditService.log({
      requestId: req.get('X-Request-ID') || 'unknown',
      userId,
      action: 'AUTH.LOGIN.FAILED',
      status: 'FAILURE',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      errorMessage: error.message,
      metadata: { reason: error.code }
    });

    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'SERVER_ERROR',
        message: error.isOperational ? error.message : 'Login failed due to server error.'
      }
    });
  }
};

/*
|--------------------------------------------------------------------------
| Refresh Access Token
|--------------------------------------------------------------------------
| - Validates refresh token
| - Implements token rotation
| - Returns new access + refresh tokens
*/
exports.refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_TOKEN_MISSING',
          message: 'Refresh token is required.'
        }
      });
    }

    const clientInfo = getClientInfo(req);

    // Call Service
    const result = await AuthService.refreshToken({
      refreshToken,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

    // Set new cookies
    if (config.cookies.enabled) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: config.cookies.secure,
        sameSite: config.cookies.sameSite,
        maxAge: config.cookies.refreshExpiry * 1000,
        path: '/api/v1/auth/refresh'
      });

      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: config.cookies.secure,
        sameSite: config.cookies.sameSite,
        maxAge: config.cookies.accessExpiry * 1000,
        path: '/'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        ...(config.cookies.enabled ? {} : { accessToken: result.accessToken, refreshToken: result.refreshToken })
      }
    });

  } catch (error) {
    logger.error(`Refresh Token Error: ${error.message}`);

    return res.status(error.statusCode || 401).json({
      success: false,
      error: {
        code: error.code || 'AUTH_TOKEN_INVALID',
        message: error.isOperational ? error.message : 'Token refresh failed.'
      }
    });
  }
};

/*
|--------------------------------------------------------------------------
| Logout User
|--------------------------------------------------------------------------
| - Revokes current session
| - Clears cookies
*/
exports.logout = async (req, res, next) => {
  try {
    const sessionId = req.body.sessionId || req.user?.sessionId;
    const userId = req.user?._id;

    if (sessionId) {
      await AuthService.revokeSession(sessionId, userId);
    }

    // Clear cookies
    if (config.cookies.enabled) {
      res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });
      res.clearCookie('accessToken', { path: '/' });
    }

    await AuditService.log({
      requestId: req.get('X-Request-ID') || 'unknown',
      userId: req.user?._id,
      action: 'AUTH.LOGOUT',
      status: 'SUCCESS',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    });

    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    logger.error(`Logout Error: ${error.message}`);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Logout failed.'
      }
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get Current User Profile
|--------------------------------------------------------------------------
*/
exports.getMe = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    logger.error(`Get Profile Error: ${error.message}`);
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch profile.'
      }
    });
  }
};

/*
|--------------------------------------------------------------------------
| Forgot Password
|--------------------------------------------------------------------------
*/
exports.forgotPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'AUTH_VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      });
    }

    const { email } = req.body;
    const clientInfo = getClientInfo(req);

    const result = await AuthService.forgotPassword({
      email,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

    // Always return success message to prevent email enumeration
    return res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.',
      ...(process.env.NODE_ENV === 'development' && result.resetToken && {
        resetToken: result.resetToken
      })
    });

  } catch (error) {
    logger.error(`Forgot Password Error: ${error.message}`);
    
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'SERVER_ERROR',
        message: 'Failed to process password reset request.'
      }
    });
  }
};

/*
|--------------------------------------------------------------------------
| Reset Password
|--------------------------------------------------------------------------
*/
exports.resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'AUTH_VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      });
    }

    const { resetToken, newPassword } = req.body;
    const clientInfo = getClientInfo(req);

    const result = await AuthService.resetPassword({
      resetToken,
      newPassword,
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

    await AuditService.log({
      requestId: clientInfo.requestId,
      userId: result.user._id,
      action: 'AUTH.PASSWORD.RESET',
      status: 'SUCCESS',
      ipAddress: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. Please login.'
    });

  } catch (error) {
    logger.error(`Reset Password Error: ${error.message}`);
    
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'SERVER_ERROR',
        message: 'Failed to reset password.'
      }
    });
  }
};
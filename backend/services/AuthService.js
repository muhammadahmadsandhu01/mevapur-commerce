const UserRepository = require('../repositories/UserRepository');
const SessionService = require('./SessionService');
const TokenService = require('./TokenService');
const AuditService = require('./AuditService');
const EmailService = require('./EmailService');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../common/errors/AppError');
const { ERROR_CODES } = require('../constants/errorCodes');
const logger = require('../common/logger');
const config = require('../config/auth.config');

class AuthService {
  /**
   * Register New User
   */
  async register(userData, ipAddress, userAgent) {
    const requestId = uuidv4();

    // Check if email already exists
    const existingUser = await UserRepository.findByEmail(userData.email);
    if (existingUser) {
      await AuditService.log({
        requestId,
        action: 'AUTH.REGISTER',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Email already registered',
        metadata: { email: userData.email }
      });

      throw new AppError('Email already registered', 409, ERROR_CODES.AUTH_EMAIL_EXISTS);
    }

    // Create user
    const user = await UserRepository.create({
      fullName: userData.fullName,
      email: userData.email,
      phone: userData.phone,
      password: userData.password,
      role: userData.role || 'customer',
      isVerified: config.autoVerifyEmail ? true : false
    });

    // Send verification email if needed
    if (!config.autoVerifyEmail) {
      const verificationToken = uuidv4();
      await UserRepository.update(user._id, { verificationToken });
      
      await EmailService.sendVerificationEmail(user.email, user.fullName, verificationToken);
    }

    await AuditService.log({
      requestId,
      userId: user._id,
      action: 'AUTH.REGISTER',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: { email: user.email }
    });

    logger.info('User registered', { userId: user._id, email: user.email });

    return {
      user,
      requiresVerification: !config.autoVerifyEmail
    };
  }

  /**
   * Login User
   */
  async login(email, password, deviceInfo, ipAddress, userAgent) {
    const requestId = uuidv4();

    // Find user by email
    const user = await UserRepository.findByEmailWithPassword(email);
    
    if (!user) {
      await AuditService.log({
        requestId,
        action: 'AUTH.LOGIN.FAILED',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'User not found',
        metadata: { email }
      });
      throw new AppError('Invalid credentials', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    // Check if account is blocked
    if (user.isBlocked) {
      await AuditService.log({
        requestId,
        userId: user._id,
        action: 'AUTH.LOGIN.FAILED',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Account blocked',
        metadata: { email }
      });
      throw new AppError('Account has been blocked', 403, ERROR_CODES.AUTH_ACCOUNT_BLOCKED);
    }

    // Check if account is locked due to failed attempts
    if (user.isAccountLocked && user.isAccountLocked()) {
      await AuditService.log({
        requestId,
        userId: user._id,
        action: 'AUTH.LOGIN.FAILED',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Account locked',
        metadata: { email, lockUntil: user.lockUntil }
      });
      throw new AppError('Account temporarily locked due to multiple failed attempts', 423, ERROR_CODES.AUTH_ACCOUNT_LOCKED);
    }

    // Verify password
    const isPasswordValid = await user.matchPassword(password);
    
    if (!isPasswordValid) {
      await user.incrementLoginAttempts();
      
      await AuditService.log({
        requestId,
        userId: user._id,
        action: 'AUTH.LOGIN.FAILED',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Invalid password',
        metadata: { email }
      });

      throw new AppError('Invalid credentials', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await UserRepository.update(user._id, { 
        loginAttempts: 0, 
        lockUntil: null 
      });
    }

    // Create session
    const session = await SessionService.createSession(user._id, deviceInfo, ipAddress);

    // Generate tokens
    const accessToken = TokenService.generateAccessToken(user._id, user.role, session.sessionId);
    const refreshToken = TokenService.generateRefreshToken();

    // Store refresh token hash in session
    await SessionService.updateRefreshToken(session._id, refreshToken);

    // Update user last login
    await UserRepository.update(user._id, { lastLogin: new Date() });

    await AuditService.log({
      requestId,
      userId: user._id,
      action: 'AUTH.LOGIN.SUCCESS',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: { 
        sessionId: session.sessionId,
        deviceId: session.deviceInfo.deviceId
      }
    });

    logger.info('User logged in', { 
      userId: user._id, 
      email: user.email,
      sessionId: session.sessionId 
    });

    return {
      user,
      session,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: TokenService.getTokenExpiry()
      }
    };
  }

  /**
   * Refresh Access Token
   */
  async refreshTokens(refreshToken, ipAddress, userAgent) {
    const requestId = uuidv4();

    if (!refreshToken) {
      throw new AppError('Refresh token required', 400, ERROR_CODES.AUTH_TOKEN_REQUIRED);
    }

    // Decode to get session ID
    const decoded = TokenService.decodeAccessToken(refreshToken);
    // Note: In real implementation, you'd extract sessionId from refresh token structure
    // For now, assuming we have a way to get sessionId
    
    // Validate refresh token and session
    // This is simplified - actual implementation would extract sessionId from DB
    const session = await SessionService.validateRefreshToken(decoded.sid, refreshToken);

    // Generate new tokens
    const newAccessToken = TokenService.generateAccessToken(
      session.user, 
      session.user.role, 
      session.sessionId
    );
    
    const newRefreshToken = TokenService.generateRefreshToken();
    
    // Rotate refresh token
    await SessionService.updateRefreshToken(session._id, newRefreshToken);

    await AuditService.log({
      requestId,
      userId: session.user,
      action: 'AUTH.TOKEN.REFRESHED',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: { sessionId: session.sessionId }
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: TokenService.getTokenExpiry()
    };
  }

  /**
   * Logout User
   */
  async logout(sessionId, userId, ipAddress, userAgent) {
    const requestId = uuidv4();

    await SessionService.revokeSession(sessionId, 'USER_LOGOUT');

    await AuditService.log({
      requestId,
      userId,
      action: 'AUTH.LOGOUT',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: { sessionId }
    });

    logger.info('User logged out', { userId, sessionId });

    return { success: true };
  }

  /**
   * Logout from All Devices
   */
  async logoutAll(userId, ipAddress, userAgent) {
    const requestId = uuidv4();

    const count = await SessionService.revokeAllSessions(userId, 'USER_LOGOUT_ALL');

    await AuditService.log({
      requestId,
      userId,
      action: 'AUTH.LOGOUT_ALL',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: { sessionsRevoked: count }
    });

    logger.info('User logged out from all devices', { userId, count });

    return { success: true, sessionsRevoked: count };
  }

  /**
   * Verify Email
   */
  async verifyEmail(token, ipAddress, userAgent) {
    const requestId = uuidv4();

    const user = await UserRepository.findByVerificationToken(token);
    
    if (!user) {
      await AuditService.log({
        requestId,
        action: 'AUTH.EMAIL.VERIFICATION_FAILED',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Invalid verification token'
      });
      throw new AppError('Invalid or expired verification token', 400, ERROR_CODES.AUTH_INVALID_TOKEN);
    }

    await UserRepository.update(user._id, {
      isVerified: true,
      verificationToken: undefined
    });

    await AuditService.log({
      requestId,
      userId: user._id,
      action: 'AUTH.EMAIL.VERIFIED',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: { email: user.email }
    });

    logger.info('Email verified', { userId: user._id, email: user.email });

    return { success: true };
  }

  /**
   * Forgot Password
   */
  async forgotPassword(email, ipAddress, userAgent) {
    const requestId = uuidv4();

    const user = await UserRepository.findByEmail(email);
    
    // Always return success to prevent email enumeration
    if (!user) {
      await AuditService.log({
        requestId,
        action: 'AUTH.PASSWORD.RESET_REQUESTED',
        status: 'WARNING',
        ipAddress,
        userAgent,
        errorMessage: 'User not found',
        metadata: { email }
      });
      return { success: true, message: 'If email exists, reset link has been sent' };
    }

    const resetToken = uuidv4();
    const resetExpiry = Date.now() + (15 * 60 * 1000); // 15 minutes

    await UserRepository.update(user._id, {
      resetPasswordToken: resetToken,
      resetPasswordExpire: resetExpiry
    });

    await EmailService.sendPasswordResetEmail(user.email, user.fullName, resetToken);

    await AuditService.log({
      requestId,
      userId: user._id,
      action: 'AUTH.PASSWORD.RESET_REQUESTED',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: { email }
    });

    logger.info('Password reset requested', { userId: user._id, email });

    return { success: true, message: 'If email exists, reset link has been sent' };
  }

  /**
   * Reset Password
   */
  async resetPassword(token, newPassword, ipAddress, userAgent) {
    const requestId = uuidv4();

    const user = await UserRepository.findByResetToken(token);
    
    if (!user || user.resetPasswordExpire < Date.now()) {
      await AuditService.log({
        requestId,
        action: 'AUTH.PASSWORD.RESET_FAILED',
        status: 'FAILURE',
        ipAddress,
        userAgent,
        errorMessage: 'Invalid or expired reset token'
      });
      throw new AppError('Invalid or expired reset token', 400, ERROR_CODES.AUTH_INVALID_TOKEN);
    }

    await UserRepository.update(user._id, {
      password: newPassword,
      resetPasswordToken: undefined,
      resetPasswordExpire: undefined,
      tokenVersion: user.tokenVersion + 1 // Invalidate all existing tokens
    });

    // Revoke all sessions
    await SessionService.revokeAllSessions(user._id, 'PASSWORD_CHANGED');

    await AuditService.log({
      requestId,
      userId: user._id,
      action: 'AUTH.PASSWORD.RESET',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: { email: user.email }
    });

    logger.info('Password reset successfully', { userId: user._id, email });

    return { success: true };
  }
}

module.exports = new AuthService();
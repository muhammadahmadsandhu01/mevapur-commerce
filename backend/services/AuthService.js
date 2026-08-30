const UserRepository = require('../repositories/UserRepository');
const SessionService = require('./SessionService');
const TokenService = require('./TokenService');
const AuditService = require('./AuditService');
const EmailService = require('./EmailService');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');
const logger = require('../common/utils/logger');
const config = require('../config/auth.config');

class AuthService {
  publicUser(user) {
    const data = typeof user.toJSON === 'function'
      ? user.toJSON()
      : { ...user };

    data.id = String(data.id || data._id);
    delete data._id;
    delete data.password;
    delete data.loginAttempts;
    delete data.lockUntil;
    delete data.tokenVersion;
    delete data.resetPasswordTokenHash;
    delete data.resetPasswordExpiresAt;
    delete data.isDeleted;
    delete data.__v;
    return data;
  }

  auditContext({ requestId, ipAddress, userAgent }) {
    return {
      requestId: requestId || uuidv4(),
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown'
    };
  }

  assertActiveUser(user) {
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
  }

  async createAuthenticatedSession({
    user,
    deviceInfo,
    ipAddress,
    userAgent
  }) {
    const sessionId = SessionService.createSessionId();
    const tokenFamilyId = uuidv4();
    const tokenVersion = Number(user.tokenVersion || 0);
    const refreshToken = TokenService.generateRefreshToken({
      userId: user._id,
      sessionId,
      tokenVersion,
      tokenFamilyId
    });
    const session = await SessionService.createSession({
      sessionId,
      userId: user._id,
      refreshToken,
      tokenFamilyId,
      deviceInfo,
      ipAddress,
      userAgent
    });
    const accessToken = TokenService.generateAccessToken({
      userId: user._id,
      sessionId,
      tokenVersion
    });

    return { session, accessToken, refreshToken };
  }

  async register({
    fullName,
    email,
    password,
    phone,
    deviceInfo,
    ipAddress,
    userAgent,
    requestId
  }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const existingUser = await UserRepository.findByEmail(email);
    if (existingUser) {
      await AuditService.log({
        ...audit,
        eventName: 'AUTH.REGISTER',
        status: 'FAILURE',
        errorCode: ERROR_CODES.AUTH_EMAIL_EXISTS,
        metadata: { emailSupplied: true }
      });
      throw new AppError(
        'Email is already registered',
        409,
        ERROR_CODES.AUTH_EMAIL_EXISTS
      );
    }

    let user;
    try {
      user = await UserRepository.create({
        fullName,
        email,
        password,
        phone,
        role: 'customer',
        isVerified: config.email.autoVerify
      });
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError(
          'Email is already registered',
          409,
          ERROR_CODES.AUTH_EMAIL_EXISTS
        );
      }
      throw error;
    }

    const authSession = await this.createAuthenticatedSession({
      user,
      deviceInfo,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent
    });
    await AuditService.log({
      ...audit,
      userId: user._id,
      sessionId: authSession.session._id,
      eventName: 'AUTH.REGISTER',
      status: 'SUCCESS',
      metadata: { sessionCreated: true }
    });

    logger.info('User registered', { userId: String(user._id) });
    return {
      user: this.publicUser(user),
      ...authSession,
      expiresIn: TokenService.getAccessTokenExpiry()
    };
  }

  async login({
    email,
    password,
    deviceInfo,
    ipAddress,
    userAgent,
    requestId
  }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const user = await UserRepository.findByEmailWithPassword(email);

    if (!user) {
      await AuditService.log({
        ...audit,
        eventName: 'AUTH.LOGIN.FAILED',
        status: 'FAILURE',
        errorCode: ERROR_CODES.AUTH_INVALID_CREDENTIALS
      });
      throw new AppError(
        'Invalid email or password',
        401,
        ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    this.assertActiveUser(user);

    if (!user.isVerified) {
      throw new AppError(
        'Email address has not been verified',
        403,
        ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED
      );
    }

    if (user.isAccountLocked()) {
      await AuditService.log({
        ...audit,
        userId: user._id,
        eventName: 'AUTH.ACCOUNT.LOCKED',
        status: 'WARNING',
        errorCode: ERROR_CODES.AUTH_ACCOUNT_LOCKED
      });
      throw new AppError(
        'Account is temporarily locked',
        423,
        ERROR_CODES.AUTH_ACCOUNT_LOCKED
      );
    }

    if (!(await user.matchPassword(password))) {
      await UserRepository.recordFailedLogin(
        user._id,
        config.security.maxLoginAttempts,
        config.security.lockoutDurationMs
      );
      await AuditService.log({
        ...audit,
        userId: user._id,
        eventName: 'AUTH.LOGIN.FAILED',
        status: 'FAILURE',
        errorCode: ERROR_CODES.AUTH_INVALID_CREDENTIALS
      });
      throw new AppError(
        'Invalid email or password',
        401,
        ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    if (user.loginAttempts > 0 || user.lockUntil) {
      await UserRepository.resetFailedLogin(user._id);
    }

    const authSession = await this.createAuthenticatedSession({
      user,
      deviceInfo,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent
    });
    await UserRepository.updateLastLogin(user._id);
    await AuditService.log({
      ...audit,
      userId: user._id,
      sessionId: authSession.session._id,
      eventName: 'AUTH.LOGIN.SUCCESS',
      status: 'SUCCESS',
      metadata: { sessionCreated: true }
    });

    logger.info('User logged in', {
      userId: String(user._id),
      sessionId: String(authSession.session._id)
    });

    return {
      user: this.publicUser(user),
      ...authSession,
      expiresIn: TokenService.getAccessTokenExpiry()
    };
  }

  async refreshTokens({
    refreshToken,
    ipAddress,
    userAgent,
    requestId
  }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const decoded = TokenService.verifyRefreshToken(refreshToken);
    await SessionService.assertRefreshSession({
      sessionId: decoded.sid,
      userId: decoded.sub,
      tokenFamilyId: decoded.tokenFamilyId,
      refreshToken,
      auditContext: audit
    });

    const user = await UserRepository.findByIdWithTokenVersion(decoded.sub);
    this.assertActiveUser(user);

    if (Number(user.tokenVersion) !== decoded.tokenVersion) {
      throw new AppError(
        'Authentication token has been invalidated',
        401,
        ERROR_CODES.AUTH_TOKEN_VERSION_MISMATCH
      );
    }

    const nextRefreshToken = TokenService.generateRefreshToken({
      userId: user._id,
      sessionId: decoded.sid,
      tokenVersion: user.tokenVersion,
      tokenFamilyId: decoded.tokenFamilyId
    });
    await SessionService.rotateRefreshToken({
      sessionId: decoded.sid,
      userId: user._id,
      tokenFamilyId: decoded.tokenFamilyId,
      currentRefreshToken: refreshToken,
      nextRefreshToken,
      auditContext: audit
    });
    const accessToken = TokenService.generateAccessToken({
      userId: user._id,
      sessionId: decoded.sid,
      tokenVersion: user.tokenVersion
    });

    await AuditService.log({
      ...audit,
      userId: user._id,
      sessionId: decoded.sid,
      eventName: 'AUTH.SESSION.REFRESHED',
      status: 'SUCCESS'
    });

    return {
      user: this.publicUser(user),
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: TokenService.getAccessTokenExpiry()
    };
  }

  async logout({ sessionId, userId, ipAddress, userAgent, requestId }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    await SessionService.revokeOwnedSession(
      sessionId,
      userId,
      'USER_LOGOUT'
    );
    await AuditService.log({
      ...audit,
      userId,
      sessionId,
      eventName: 'AUTH.LOGOUT',
      status: 'SUCCESS'
    });
    return { success: true };
  }

  async logoutAll({ userId, ipAddress, userAgent, requestId }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    await UserRepository.incrementTokenVersion(userId);
    const sessionsRevoked = await SessionService.revokeAllSessions(
      userId,
      'USER_LOGOUT_ALL'
    );
    await AuditService.log({
      ...audit,
      userId,
      eventName: 'AUTH.SESSION.REVOKED_ALL',
      status: 'SUCCESS',
      metadata: { sessionsRevoked }
    });
    return { success: true, sessionsRevoked };
  }

  async getSessions({ userId, currentSessionId }) {
    return SessionService.getActiveSessions(userId, currentSessionId);
  }

  async revokeSession({
    sessionId,
    userId,
    currentSessionId,
    ipAddress,
    userAgent,
    requestId
  }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    await SessionService.revokeOwnedSession(
      sessionId,
      userId,
      'USER_SESSION_REVOKE'
    );
    await AuditService.log({
      ...audit,
      userId,
      sessionId,
      eventName: 'AUTH.SESSION.REVOKED',
      status: 'SUCCESS'
    });
    return { revoked: true, revokedCurrent: String(sessionId) === String(currentSessionId) };
  }

  async forgotPassword({ email, ipAddress, userAgent, requestId }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const user = await UserRepository.findByEmail(email);

    if (!user || user.isDeleted) {
      await AuditService.log({
        ...audit,
        eventName: 'AUTH.PASSWORD.RESET.REQUEST',
        status: 'WARNING',
        metadata: { accountMatched: false }
      });
      return { success: true };
    }

    const { CANONICAL_ROLES, STAFF_ROLES } = require('../constants/roleConstants');
    let audience;
    if (user.role === CANONICAL_ROLES.CUSTOMER) {
      audience = 'storefront';
    } else if (STAFF_ROLES.includes(user.role)) {
      audience = 'admin';
    } else {
      await AuditService.log({
        ...audit,
        eventName: 'AUTH.PASSWORD.RESET.REQUEST',
        status: 'FAILURE',
        errorCode: ERROR_CODES.AUTH_ROLE_NOT_FOUND,
        metadata: { email, role: user.role }
      });
      return { success: true };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = SessionService.hashToken(resetToken);
    const expiresAt = new Date(
      Date.now() + config.security.resetTokenExpiryMs
    );
    await UserRepository.setPasswordResetToken(
      user._id,
      resetTokenHash,
      expiresAt
    );
    await EmailService.sendPasswordResetEmail(
      user.email,
      user.fullName,
      resetToken,
      { audience }
    );
    await AuditService.log({
      ...audit,
      userId: user._id,
      eventName: 'AUTH.PASSWORD.RESET.REQUEST',
      status: 'SUCCESS',
      metadata: { accountMatched: true }
    });

    return { success: true };
  }

  async resetPassword({
    resetToken,
    newPassword,
    ipAddress,
    userAgent,
    requestId
  }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const resetTokenHash = SessionService.hashToken(resetToken);
    const user = await UserRepository.findByValidPasswordResetToken(
      resetTokenHash
    );
    if (!user) {
      await AuditService.log({
        ...audit,
        eventName: 'AUTH.PASSWORD.RESET.COMPLETE',
        status: 'FAILURE',
        errorCode: ERROR_CODES.AUTH_RESET_TOKEN_INVALID
      });
      throw new AppError(
        'Password reset token is invalid or expired',
        400,
        ERROR_CODES.AUTH_RESET_TOKEN_INVALID
      );
    }

    user.password = newPassword;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await UserRepository.save(user);
    await SessionService.revokeAllSessions(user._id, 'PASSWORD_CHANGED');
    await AuditService.log({
      ...audit,
      userId: user._id,
      eventName: 'AUTH.PASSWORD.RESET.COMPLETE',
      status: 'SUCCESS',
      metadata: { sessionsRevoked: true }
    });

    return { success: true };
  }

  async changePassword({
    userId,
    currentPassword,
    newPassword,
    ipAddress,
    userAgent,
    requestId
  }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const user = await UserRepository.findByIdWithPassword(userId);
    this.assertActiveUser(user);

    if (!(await user.matchPassword(currentPassword))) {
      throw new AppError(
        'Current password is incorrect',
        401,
        ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    if (await user.matchPassword(newPassword)) {
      throw new AppError(
        'New password must differ from the current password',
        400,
        ERROR_CODES.AUTH_PASSWORD_REUSE
      );
    }

    user.password = newPassword;
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await UserRepository.save(user);
    const sessionsRevoked = await SessionService.revokeAllSessions(
      user._id,
      'PASSWORD_CHANGED'
    );
    await AuditService.log({
      ...audit,
      userId: user._id,
      eventName: 'AUTH.PASSWORD.CHANGED',
      status: 'SUCCESS',
      metadata: { sessionsRevoked }
    });
    return { success: true };
  }
}

module.exports = new AuthService();

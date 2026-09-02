const UserRepository = require('../repositories/UserRepository');
const SessionService = require('./SessionService');
const TokenService = require('./TokenService');
const AuditService = require('./AuditService');
const EmailService = require('./EmailService');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');
const logger = require('../common/utils/logger');
const config = require('../config/auth.config');
const MfaService = require('./MfaService');
const StaffInvitation = require('../models/StaffInvitation');
const User = require('../models/User');
const { validatePasswordStrength } = require('../utils/passwordValidator');
const { CANONICAL_ROLES, STAFF_ROLES } = require('../constants/roleConstants');

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

    if (user.mfaEnabled) {
      const mfaToken = TokenService.generateMfaToken({
        userId: user._id,
        email: user.email,
        role: user.role
      });
      await AuditService.log({
        ...audit,
        userId: user._id,
        eventName: 'AUTH.MFA.CHALLENGE_ISSUED',
        status: 'SUCCESS',
        metadata: { role: user.role }
      });
      return {
        mfaRequired: true,
        mfaToken,
        user: {
          email: user.email,
          role: user.role
        }
      };
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

    try {
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
    } catch (emailError) {
      let rollbackSucceeded = false;
      try {
        const rolledBackUser = await UserRepository.clearPasswordResetTokenConditionally(
          user._id,
          resetTokenHash
        );
        rollbackSucceeded = !!rolledBackUser;
      } catch (rollbackError) {
        logger.error('Token rollback query failed on email delivery failure');
      }

      logger.warn('SMTP delivery failed during password reset. Rollback executed.', {
        rollbackSucceeded
      });

      await AuditService.log({
        ...audit,
        userId: user._id,
        eventName: 'AUTH.PASSWORD.RESET.REQUEST',
        status: 'FAILURE',
        errorCode: ERROR_CODES.EMAIL_SEND_FAILED,
        metadata: { emailMatched: true, rollbackSucceeded }
      });
    }

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

  /*
  |--------------------------------------------------------------------------
  | Multi-Factor Authentication (MFA) Workflows
  |--------------------------------------------------------------------------
  */

  async verifyMfaLogin({
    mfaToken,
    code,
    recoveryCode,
    deviceInfo,
    ipAddress,
    userAgent,
    requestId
  }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const decoded = TokenService.verifyMfaToken(mfaToken);
    const user = await User.findById(decoded.sub).select('+mfaSecretEncrypted +mfaRecoveryCodeHashes +mfaLastUsedTimestep +tokenVersion');

    if (!user || user.isDeleted) {
      throw new AppError('Account is unavailable', 401, ERROR_CODES.AUTH_ACCOUNT_INACTIVE);
    }
    if (user.isBlocked) {
      throw new AppError('Account has been blocked', 403, ERROR_CODES.AUTH_ACCOUNT_BLOCKED);
    }
    if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new AppError('MFA is not configured for this account', 400, ERROR_CODES.AUTH_MFA_NOT_ENABLED);
    }

    let authenticated = false;
    let methodUsed = 'totp';

    if (recoveryCode && typeof recoveryCode === 'string') {
      const { valid, updatedHashes } = MfaService.verifyRecoveryCode(user.mfaRecoveryCodeHashes || [], recoveryCode);
      if (!valid) {
        await AuditService.log({
          ...audit,
          userId: user._id,
          eventName: 'AUTH.MFA.VERIFY.FAILED',
          status: 'FAILURE',
          errorCode: ERROR_CODES.AUTH_MFA_INVALID,
          metadata: { method: 'recovery_code' }
        });
        throw new AppError('Invalid or already used backup recovery code', 401, ERROR_CODES.AUTH_MFA_INVALID);
      }
      user.mfaRecoveryCodeHashes = updatedHashes;
      authenticated = true;
      methodUsed = 'recovery_code';
    } else if (code && typeof code === 'string') {
      const plainSecret = MfaService.decryptSecret(user.mfaSecretEncrypted);
      const { valid, timestepUsed } = MfaService.verifyTotp({
        secret: plainSecret,
        token: code,
        lastUsedTimestep: user.mfaLastUsedTimestep
      });

      if (!valid) {
        await AuditService.log({
          ...audit,
          userId: user._id,
          eventName: 'AUTH.MFA.VERIFY.FAILED',
          status: 'FAILURE',
          errorCode: ERROR_CODES.AUTH_MFA_INVALID,
          metadata: { method: 'totp' }
        });
        throw new AppError('Invalid or expired MFA code', 401, ERROR_CODES.AUTH_MFA_INVALID);
      }

      user.mfaLastUsedTimestep = timestepUsed;
      authenticated = true;
    } else {
      throw new AppError('MFA code or backup recovery code is required', 400, ERROR_CODES.AUTH_MFA_REQUIRED);
    }

    await user.save();

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
      eventName: 'AUTH.MFA.VERIFY.SUCCESS',
      status: 'SUCCESS',
      metadata: { method: methodUsed }
    });

    return {
      user: this.publicUser(user),
      ...authSession,
      expiresIn: TokenService.getAccessTokenExpiry()
    };
  }

  async setupMfa({ userId, requestId, ipAddress, userAgent }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const user = await User.findById(userId);
    this.assertActiveUser(user);

    if (user.mfaEnabled) {
      throw new AppError('MFA is already configured and enabled for this account', 400, ERROR_CODES.AUTH_MFA_ALREADY_ENABLED);
    }

    const { secret, otpauthUri } = MfaService.generateSecret({
      accountEmail: user.email,
      issuer: config.brandName || 'MevaPur'
    });
    const { plainCodes, hashedCodes } = MfaService.generateRecoveryCodes(8);

    user.mfaSecretEncrypted = MfaService.encryptSecret(secret);
    user.mfaRecoveryCodeHashes = hashedCodes;
    await user.save();

    await AuditService.log({
      ...audit,
      userId: user._id,
      eventName: 'AUTH.MFA.SETUP.INITIATED',
      status: 'SUCCESS'
    });

    return {
      secret,
      otpauthUri,
      recoveryCodes: plainCodes
    };
  }

  async confirmMfa({ userId, code, requestId, ipAddress, userAgent }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const user = await User.findById(userId).select('+mfaSecretEncrypted +mfaLastUsedTimestep');
    this.assertActiveUser(user);

    if (!user.mfaSecretEncrypted) {
      throw new AppError('MFA setup must be initiated before confirmation', 400, ERROR_CODES.AUTH_MFA_NOT_ENABLED);
    }

    const plainSecret = MfaService.decryptSecret(user.mfaSecretEncrypted);
    const { valid, timestepUsed } = MfaService.verifyTotp({
      secret: plainSecret,
      token: code,
      lastUsedTimestep: user.mfaLastUsedTimestep
    });

    if (!valid) {
      await AuditService.log({
        ...audit,
        userId: user._id,
        eventName: 'AUTH.MFA.CONFIRM.FAILED',
        status: 'FAILURE',
        errorCode: ERROR_CODES.AUTH_MFA_INVALID
      });
      throw new AppError('Invalid MFA verification code', 400, ERROR_CODES.AUTH_MFA_INVALID);
    }

    user.mfaEnabled = true;
    user.mfaEnrolledAt = new Date();
    user.mfaLastUsedTimestep = timestepUsed;
    await user.save();

    await AuditService.log({
      ...audit,
      userId: user._id,
      eventName: 'AUTH.MFA.ENROLLED',
      status: 'SUCCESS'
    });

    return { success: true, mfaEnabled: true };
  }

  async disableMfa({ userId, password, code, currentUserId, currentUserRole, requestId, ipAddress, userAgent }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const user = await User.findById(userId).select('+password +mfaSecretEncrypted +mfaLastUsedTimestep +tokenVersion');
    this.assertActiveUser(user);

    if (!user.mfaEnabled) {
      throw new AppError('MFA is not currently enabled for this account', 400, ERROR_CODES.AUTH_MFA_NOT_ENABLED);
    }

    // If disabling self, verify current password and TOTP code
    if (String(userId) === String(currentUserId)) {
      if (!password || !(await user.matchPassword(password))) {
        throw new AppError('Current password is incorrect', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
      }

      if (code) {
        const plainSecret = MfaService.decryptSecret(user.mfaSecretEncrypted);
        const { valid } = MfaService.verifyTotp({
          secret: plainSecret,
          token: code,
          lastUsedTimestep: user.mfaLastUsedTimestep
        });
        if (!valid) {
          throw new AppError('Invalid MFA verification code', 400, ERROR_CODES.AUTH_MFA_INVALID);
        }
      }
    } else {
      // SuperAdmin override check
      if (currentUserRole !== CANONICAL_ROLES.SUPER_ADMIN) {
        throw new AppError('Only Super Admin can disable MFA for another staff member', 403, ERROR_CODES.AUTH_FORBIDDEN);
      }
    }

    user.mfaEnabled = false;
    user.mfaSecretEncrypted = null;
    user.mfaRecoveryCodeHashes = [];
    user.mfaLastUsedTimestep = null;
    user.mfaEnrolledAt = null;
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();

    await SessionService.revokeAllSessions(user._id, 'MFA_DISABLED');

    await AuditService.log({
      ...audit,
      userId: user._id,
      eventName: 'AUTH.MFA.DISABLED',
      status: 'SUCCESS',
      metadata: { disabledBy: String(currentUserId) }
    });

    return { success: true, mfaEnabled: false };
  }

  async regenerateRecoveryCodes({ userId, password, code, requestId, ipAddress, userAgent }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const user = await User.findById(userId).select('+password +mfaSecretEncrypted +mfaLastUsedTimestep');
    this.assertActiveUser(user);

    if (!user.mfaEnabled) {
      throw new AppError('MFA is not enabled', 400, ERROR_CODES.AUTH_MFA_NOT_ENABLED);
    }

    if (!password || !(await user.matchPassword(password))) {
      throw new AppError('Current password is incorrect', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    if (code) {
      const plainSecret = MfaService.decryptSecret(user.mfaSecretEncrypted);
      const { valid, timestepUsed } = MfaService.verifyTotp({
        secret: plainSecret,
        token: code,
        lastUsedTimestep: user.mfaLastUsedTimestep
      });
      if (!valid) {
        throw new AppError('Invalid MFA verification code', 400, ERROR_CODES.AUTH_MFA_INVALID);
      }
      user.mfaLastUsedTimestep = timestepUsed;
    }

    const { plainCodes, hashedCodes } = MfaService.generateRecoveryCodes(8);
    user.mfaRecoveryCodeHashes = hashedCodes;
    await user.save();

    await AuditService.log({
      ...audit,
      userId: user._id,
      eventName: 'AUTH.MFA.RECOVERY_CODES_REGENERATED',
      status: 'SUCCESS'
    });

    return { recoveryCodes: plainCodes };
  }

  /*
  |--------------------------------------------------------------------------
  | Staff Invitation Lifecycle Workflows
  |--------------------------------------------------------------------------
  */

  async inviteStaff({ email, role, invitedBy, requestId, ipAddress, userAgent }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const normalizedEmail = (email || '').toLowerCase().trim();

    if (!STAFF_ROLES.includes(role)) {
      throw new AppError(`Invalid staff role: ${role}`, 400, ERROR_CODES.AUTH_ROLE_NOT_FOUND);
    }

    const existingUser = await User.findOne({ email: normalizedEmail, isDeleted: false });
    if (existingUser) {
      throw new AppError('An active account with this email address already exists', 409, ERROR_CODES.AUTH_EMAIL_EXISTS);
    }

    // Invalidate any existing pending invitation for this email
    await StaffInvitation.updateMany(
      { email: normalizedEmail, status: 'pending' },
      { $set: { status: 'revoked', revokedAt: new Date() } }
    );

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48-hour TTL

    const invitation = await StaffInvitation.create({
      email: normalizedEmail,
      role,
      tokenHash,
      status: 'pending',
      expiresAt,
      invitedBy
    });

    try {
      await EmailService.sendStaffInvitationEmail(normalizedEmail, role, token);
    } catch (emailError) {
      await StaffInvitation.findByIdAndDelete(invitation._id);
      logger.error('Failed to send staff invitation email, rolling back invitation record', { email: normalizedEmail });
      throw new AppError('Failed to send invitation email via configured mail transport', 502, ERROR_CODES.EMAIL_DELIVERY_FAILED);
    }

    await AuditService.log({
      ...audit,
      userId: invitedBy,
      eventName: 'STAFF.INVITATION.CREATED',
      status: 'SUCCESS',
      metadata: { invitedEmail: normalizedEmail, role }
    });

    return {
      invitationId: String(invitation._id),
      email: normalizedEmail,
      role,
      expiresAt
    };
  }

  async acceptInvitation({
    token,
    fullName,
    password,
    phone,
    deviceInfo,
    ipAddress,
    userAgent,
    requestId
  }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    if (!token || typeof token !== 'string') {
      throw new AppError('Invitation token is required', 400, ERROR_CODES.AUTH_INVITATION_INVALID);
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const invitation = await StaffInvitation.findOne({
      tokenHash,
      status: 'pending'
    });

    if (!invitation) {
      throw new AppError('Invitation is invalid, revoked, or already accepted', 400, ERROR_CODES.AUTH_INVITATION_INVALID);
    }

    if (invitation.expiresAt <= new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      throw new AppError('Invitation has expired. Please request a new invitation', 400, ERROR_CODES.AUTH_INVITATION_EXPIRED);
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      throw new AppError(strength.message, 400, ERROR_CODES.AUTH_PASSWORD_WEAK);
    }

    const user = await UserRepository.create({
      fullName: (fullName || '').trim(),
      email: invitation.email,
      password,
      phone: (phone || '').trim(),
      role: invitation.role,
      isVerified: true,
      isBlocked: false
    });

    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    await invitation.save();

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
      eventName: 'STAFF.INVITATION.ACCEPTED',
      status: 'SUCCESS',
      metadata: { role: user.role }
    });

    return {
      user: this.publicUser(user),
      ...authSession,
      expiresIn: TokenService.getAccessTokenExpiry()
    };
  }

  async resendInvitation({ invitationId, invitedBy, requestId, ipAddress, userAgent }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const invitation = await StaffInvitation.findById(invitationId);

    if (!invitation || invitation.status !== 'pending') {
      throw new AppError('Pending invitation was not found', 404, ERROR_CODES.AUTH_INVITATION_INVALID);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    invitation.tokenHash = tokenHash;
    invitation.expiresAt = expiresAt;
    await invitation.save();

    await EmailService.sendStaffInvitationEmail(invitation.email, invitation.role, token);

    await AuditService.log({
      ...audit,
      userId: invitedBy,
      eventName: 'STAFF.INVITATION.RESENT',
      status: 'SUCCESS',
      metadata: { email: invitation.email }
    });

    return { success: true, expiresAt };
  }

  async revokeInvitation({ invitationId, revokedBy, requestId, ipAddress, userAgent }) {
    const audit = this.auditContext({ requestId, ipAddress, userAgent });
    const invitation = await StaffInvitation.findById(invitationId);

    if (!invitation) {
      throw new AppError('Invitation was not found', 404, ERROR_CODES.AUTH_INVITATION_INVALID);
    }

    invitation.status = 'revoked';
    invitation.revokedAt = new Date();
    await invitation.save();

    await AuditService.log({
      ...audit,
      userId: revokedBy,
      eventName: 'STAFF.INVITATION.REVOKED',
      status: 'SUCCESS',
      metadata: { email: invitation.email }
    });

    return { success: true };
  }

  async listInvitations({ status, page = 1, limit = 20 }) {
    const filter = {};
    if (status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [invitations, total] = await Promise.all([
      StaffInvitation.find(filter)
        .populate('invitedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      StaffInvitation.countDocuments(filter)
    ]);

    return {
      invitations,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }
}

module.exports = new AuthService();


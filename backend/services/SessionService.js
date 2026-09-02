const crypto = require('crypto');
const mongoose = require('mongoose');
const SessionRepository = require('../repositories/SessionRepository');
const AuditService = require('./AuditService');
const uuidv4 = () => crypto.randomUUID();
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');
const config = require('../config/auth.config');

class SessionService {
  createSessionId() {
    return new mongoose.Types.ObjectId();
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  hashesMatch(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(left, 'hex'),
      Buffer.from(right, 'hex')
    );
  }

  async createSession({
    sessionId,
    userId,
    refreshToken,
    tokenFamilyId = uuidv4(),
    deviceInfo = {},
    ipAddress = 'unknown',
    userAgent = 'unknown'
  }) {
    return SessionRepository.create({
      _id: sessionId,
      user: userId,
      refreshTokenHash: this.hashToken(refreshToken),
      tokenFamilyId,
      deviceInfo: {
        deviceId: deviceInfo.deviceId || uuidv4(),
        deviceName: deviceInfo.deviceName || 'Unknown Device',
        browser: deviceInfo.browser || 'Unknown',
        os: deviceInfo.os || 'Unknown'
      },
      ipAddress,
      userAgent,
      country: deviceInfo.country || 'Unknown',
      city: deviceInfo.city || 'Unknown',
      isActive: true,
      isRevoked: false,
      lastActive: new Date(),
      expiresAt: new Date(Date.now() + config.cookie.refresh.maxAge)
    });
  }

  async assertRefreshSession({
    sessionId,
    userId,
    tokenFamilyId,
    refreshToken,
    auditContext
  }) {
    const session = await SessionRepository.findForRefresh(sessionId);
    if (!session) {
      throw new AppError(
        'Authentication session was not found',
        401,
        ERROR_CODES.AUTH_SESSION_NOT_FOUND
      );
    }

    if (
      String(session.user) !== String(userId)
      || session.tokenFamilyId !== tokenFamilyId
    ) {
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

    const presentedHash = this.hashToken(refreshToken);
    if (!this.hashesMatch(session.refreshTokenHash, presentedHash)) {
      await this.revokeTokenFamily(
        userId,
        tokenFamilyId,
        'REFRESH_TOKEN_REUSE'
      );
      await AuditService.log({
        ...auditContext,
        userId,
        sessionId,
        eventName: 'AUTH.TOKEN.REUSE_DETECTED',
        status: 'WARNING',
        metadata: { tokenFamilyRevoked: true }
      });

      throw new AppError(
        'Refresh token reuse was detected',
        401,
        ERROR_CODES.AUTH_TOKEN_REUSE_DETECTED
      );
    }

    return session;
  }

  async rotateRefreshToken({
    sessionId,
    userId,
    tokenFamilyId,
    currentRefreshToken,
    nextRefreshToken,
    auditContext
  }) {
    const currentHash = this.hashToken(currentRefreshToken);
    const nextHash = this.hashToken(nextRefreshToken);
    const rotated = await SessionRepository.rotateRefreshToken(
      sessionId,
      currentHash,
      nextHash
    );

    if (!rotated) {
      await this.revokeTokenFamily(
        userId,
        tokenFamilyId,
        'CONCURRENT_REFRESH_OR_REUSE'
      );
      await AuditService.log({
        ...auditContext,
        userId,
        sessionId,
        eventName: 'AUTH.TOKEN.REUSE_DETECTED',
        status: 'WARNING',
        metadata: { tokenFamilyRevoked: true }
      });

      throw new AppError(
        'Refresh token reuse was detected',
        401,
        ERROR_CODES.AUTH_TOKEN_REUSE_DETECTED
      );
    }

    return rotated;
  }

  async revokeOwnedSession(sessionId, userId, reason = 'USER_REQUEST') {
    const existing = await SessionRepository.findById(sessionId);
    if (!existing) {
      throw new AppError(
        'Authentication session was not found',
        404,
        ERROR_CODES.AUTH_SESSION_NOT_FOUND
      );
    }

    if (String(existing.user) !== String(userId)) {
      throw new AppError(
        'You cannot revoke another user session',
        403,
        ERROR_CODES.AUTH_FORBIDDEN
      );
    }

    if (!existing.isActive || existing.isRevoked) return existing;
    return SessionRepository.revokeOwned(sessionId, userId, reason);
  }

  async revokeAllSessions(userId, reason = 'USER_REQUEST') {
    const result = await SessionRepository.revokeAllByUser(userId, reason);
    return result.modifiedCount || 0;
  }

  async revokeTokenFamily(userId, tokenFamilyId, reason) {
    const result = await SessionRepository.revokeTokenFamily(
      userId,
      tokenFamilyId,
      reason
    );
    return result.modifiedCount || 0;
  }

  async getActiveSessions(userId, currentSessionId) {
    const sessions = await SessionRepository.findByUserId(userId);
    return sessions.map((session) => ({
      id: String(session._id),
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      country: session.country,
      city: session.city,
      lastActive: session.lastActive,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: String(session._id) === String(currentSessionId)
    }));
  }
}

module.exports = new SessionService();

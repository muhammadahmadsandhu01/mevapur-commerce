const SessionRepository = require('../repositories/SessionRepository');
const AuditService = require('./AuditService');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../common/errors/AppError');
const { ERROR_CODES } = require('../constants/errorCodes');
const logger = require('../common/logger');

class SessionService {
  /**
   * Create New Session
   */
  async createSession(userId, deviceInfo, ipAddress) {
    const sessionId = uuidv4();
    
    const sessionData = {
      user: userId,
      sessionId,
      refreshTokenHash: null, // Will be set after token generation
      deviceInfo: {
        deviceId: deviceInfo.deviceId || uuidv4(),
        deviceName: deviceInfo.deviceName || 'Unknown Device',
        browser: deviceInfo.browser || 'Unknown',
        os: deviceInfo.os || 'Unknown',
        platform: deviceInfo.platform || 'Unknown'
      },
      location: {
        ipAddress,
        country: deviceInfo.country || 'Unknown',
        city: deviceInfo.city || 'Unknown'
      },
      isActive: true,
      lastActive: new Date(),
      expiresAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days
    };

    const session = await SessionRepository.create(sessionData);
    
    logger.info('Session created', { 
      sessionId, 
      userId, 
      device: deviceInfo.deviceName 
    });

    return session;
  }

  /**
   * Update Refresh Token Hash
   */
  async updateRefreshToken(sessionId, refreshToken) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    return await SessionRepository.update(sessionId, {
      refreshTokenHash: hash,
      lastActive: new Date()
    });
  }

  /**
   * Validate Refresh Token
   */
  async validateRefreshToken(sessionId, refreshToken) {
    const crypto = require('crypto');
    const providedHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    const session = await SessionRepository.findById(sessionId);
    
    if (!session) {
      throw new AppError('Session not found', 404, ERROR_CODES.AUTH_SESSION_NOT_FOUND);
    }

    if (!session.isActive) {
      throw new AppError('Session has been revoked', 401, ERROR_CODES.AUTH_SESSION_REVOKED);
    }

    if (session.expiresAt < new Date()) {
      throw new AppError('Session expired', 401, ERROR_CODES.AUTH_SESSION_EXPIRED);
    }

    if (session.refreshTokenHash !== providedHash) {
      // Potential token reuse attack - revoke all sessions
      await this.revokeAllSessions(session.user.toString());
      throw new AppError('Invalid refresh token - possible reuse detected', 401, ERROR_CODES.AUTH_TOKEN_REUSE_DETECTED);
    }

    return session;
  }

  /**
   * Revoke Single Session
   */
  async revokeSession(sessionId, reason = 'USER_REQUEST') {
    const session = await SessionRepository.update(sessionId, {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: reason
    });

    await AuditService.log({
      userId: session.user,
      action: 'AUTH.SESSION.REVOKED',
      status: 'SUCCESS',
      metadata: { sessionId, reason }
    });

    return session;
  }

  /**
   * Revoke All Sessions for User
   */
  async revokeAllSessions(userId, reason = 'USER_REQUEST') {
    const sessions = await SessionRepository.findByUser(userId);
    
    for (const session of sessions) {
      await SessionRepository.update(session._id, {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason
      });
    }

    await AuditService.log({
      userId,
      action: 'AUTH.SESSION.REVOKED_ALL',
      status: 'SUCCESS',
      metadata: { count: sessions.length, reason }
    });

    return sessions.length;
  }

  /**
   * Get Active Sessions for User
   */
  async getActiveSessions(userId) {
    return await SessionRepository.findActiveByUser(userId);
  }

  /**
   * Cleanup Expired Sessions
   */
  async cleanupExpiredSessions() {
    const result = await SessionRepository.deleteExpired();
    logger.info('Expired sessions cleaned up', { count: result.deletedCount });
    return result;
  }
}

module.exports = new SessionService();
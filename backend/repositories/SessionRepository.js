const Session = require('../models/Session');

class SessionRepository {
  async create(sessionData) {
    const session = new Session(sessionData);
    return session.save();
  }

  async findByUserId(userId) {
    return Session.find({
      user: userId,
      isActive: true,
      isRevoked: false,
      expiresAt: { $gt: new Date() }
    }).sort({ lastActive: -1 });
  }

  async findById(id) {
    return Session.findById(id);
  }

  async findForRefresh(id) {
    return Session.findById(id).select('+refreshTokenHash');
  }

  async updateLastActive(id) {
    return Session.findByIdAndUpdate(
      id,
      { $set: { lastActive: new Date() } },
      { new: true }
    );
  }

  async rotateRefreshToken(id, expectedHash, nextHash) {
    return Session.findOneAndUpdate(
      {
        _id: id,
        refreshTokenHash: expectedHash,
        isActive: true,
        isRevoked: false,
        expiresAt: { $gt: new Date() }
      },
      {
        $set: {
          refreshTokenHash: nextHash,
          lastActive: new Date(),
          lastRotatedAt: new Date()
        }
      },
      { new: true }
    ).select('+refreshTokenHash');
  }

  async revokeOwned(id, userId, reason) {
    return Session.findOneAndUpdate(
      { _id: id, user: userId, isActive: true, isRevoked: false },
      {
        $set: {
          isActive: false,
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: reason
        }
      },
      { new: true }
    );
  }

  async revokeAllByUser(userId, reason) {
    return Session.updateMany(
      { user: userId, isActive: true, isRevoked: false },
      {
        $set: {
          isActive: false,
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: reason
        }
      }
    );
  }

  async revokeTokenFamily(userId, tokenFamilyId, reason) {
    return Session.updateMany(
      {
        user: userId,
        tokenFamilyId,
        isActive: true,
        isRevoked: false
      },
      {
        $set: {
          isActive: false,
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: reason
        }
      }
    );
  }
}

module.exports = new SessionRepository();

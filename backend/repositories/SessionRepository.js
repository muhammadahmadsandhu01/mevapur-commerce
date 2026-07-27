const Session = require('../models/Session');

class SessionRepository {
  async create(sessionData) {
    const session = new Session(sessionData);
    return await session.save();
  }

  async findByUserId(userId) {
    return await Session.find({ user: userId, isActive: true })
      .sort({ lastActiveAt: -1 });
  }

  async findById(id) {
    return await Session.findById(id);
  }

  async findByRefreshTokenHash(hash) {
    return await Session.findOne({ refreshTokenHash: hash }).select('+refreshTokenHash');
  }

  async updateLastActive(id) {
    return await Session.findByIdAndUpdate(id, { lastActiveAt: new Date() }, { new: true });
  }

  async revoke(id, reason) {
    return await Session.findByIdAndUpdate(id, {
      isActive: false,
      revokedAt: new Date(),
      revokeReason: reason
    }, { new: true });
  }

  async revokeAllByUser(userId, reason) {
    return await Session.updateMany(
      { user: userId, isActive: true },
      {
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason
      }
    );
  }

  async deleteExpired() {
    // TTL index handles most, but this can force cleanup if needed
    return await Session.deleteMany({ expiresAt: { $lt: new Date() } });
  }
}

module.exports = new SessionRepository();
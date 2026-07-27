const AuditLog = require('../models/AuditLog');

class AuditLogRepository {
  async create(data) {
    return await AuditLog.create(data);
  }

  async findByUserId(userId, limit = 50) {
    return await AuditLog.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findByAction(action, limit = 50) {
    return await AuditLog.find({ action })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findSuspiciousActivity(ipAddress, windowMs = 3600000) {
    const windowStart = new Date(Date.now() - windowMs);
    return await AuditLog.find({
      ipAddress,
      status: 'FAILURE',
      createdAt: { $gte: windowStart }
    });
  }
}

module.exports = new AuditLogRepository();
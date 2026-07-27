const AuditLog = require('../models/AuditLog');

class AuditRepository {
  async log(auditData) {
    // Immutable insert only
    return await AuditLog.create(auditData);
  }

  async findByUser(userId, limit = 50) {
    return await AuditLog.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findByAction(action, limit = 50) {
    return await AuditLog.find({ action })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findSecurityEvents(limit = 100) {
    const securityActions = [
      'AUTH.LOGIN.FAILED',
      'AUTH.SESSION.REVOKED',
      'AUTH.2FA.ENABLED',
      'AUTH.2FA.DISABLED'
    ];
    
    return await AuditLog.find({ action: { $in: securityActions } })
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

module.exports = new AuditRepository();
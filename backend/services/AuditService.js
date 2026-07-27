const AuditLogRepository = require('../repositories/AuditLogRepository');
const logger = require('../common/utils/logger'); // Path fixed here
const { v4: uuidv4 } = require('uuid');

class AuditService {
  async log({ requestId, userId, action, status, ipAddress, userAgent, metadata = {}, errorMessage = null }) {
    try {
      const auditData = {
        requestId,
        userId,
        action,
        status,
        ipAddress,
        userAgent,
        metadata,
        errorMessage
      };

      await AuditLogRepository.create(auditData);

      // Log to file/console as well for immediate visibility
      const logLevel = status === 'FAILURE' ? 'warn' : 'info';
      logger[logLevel](`Audit Event: ${action}`, { userId, status, requestId });
      
    } catch (error) {
      // Never let audit logging fail the main operation
      logger.error(`Failed to write audit log: ${error.message}`, { action, requestId });
    }
  }

  async getUserActivity(userId, limit = 50) {
    return await AuditLogRepository.findByUserId(userId, limit);
  }

  async getSuspiciousActivity(ipAddress, windowMs = 3600000) {
    return await AuditLogRepository.findSuspiciousActivity(ipAddress, windowMs);
  }
}

module.exports = new AuditService();
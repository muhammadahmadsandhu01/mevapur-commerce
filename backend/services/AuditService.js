const AuditLogRepository = require('../repositories/AuditLogRepository');
const logger = require('../common/utils/logger'); // Path fixed here
const { v4: uuidv4 } = require('uuid');

const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'resettoken',
  'authorization',
  'cookie',
  'cookies',
  'secret'
]);

const redact = (value, key = '') => {
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey)
      ])
    );
  }
  return value;
};

class AuditService {
  async log({
    requestId,
    userId = null,
    sessionId = null,
    eventName,
    action,
    status,
    ipAddress = 'unknown',
    userAgent = 'unknown',
    metadata = {},
    errorMessage = null,
    errorCode = null
  }) {
    const normalizedEventName = eventName || action;
    const normalizedRequestId = requestId || uuidv4();

    try {
      const auditData = {
        eventId: uuidv4(),
        requestId: normalizedRequestId,
        userId,
        sessionId,
        eventName: normalizedEventName,
        status,
        ipAddress,
        userAgent,
        metadata: redact(metadata),
        errorMessage: errorMessage ? String(errorMessage).slice(0, 500) : null,
        errorCode
      };

      const result = await AuditLogRepository.create(auditData);

      const logLevel = status === 'FAILURE' ? 'warn' : 'info';
      logger[logLevel]('Authentication audit event recorded', {
        eventName: normalizedEventName,
        userId,
        status,
        requestId: normalizedRequestId
      });

      return result;
    } catch (error) {
      logger.error('Authentication audit write failed', {
        eventName: normalizedEventName,
        requestId: normalizedRequestId,
        errorName: error.name,
        errorCode: error.code
      });
      return null;
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

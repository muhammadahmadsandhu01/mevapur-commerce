const crypto = require('crypto');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const logger = require('../common/utils/logger');
const uuidv4 = () => crypto.randomUUID();

const SENSITIVE_KEY_PATTERNS = [
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
  'secret',
  'cvv',
  'creditcard',
  'cardnumber',
  'accountnumber',
  'apikey',
  'privatekey'
];

const isSensitiveKey = (key = '') => {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const sanitizeString = (str, maxLen = 500) => {
  if (typeof str !== 'string') return str;
  // Neutralize CRLF and control characters to prevent log forging
  const neutralized = str.replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').trim();
  return neutralized.slice(0, maxLen);
};

const sanitizeUrlTokens = (urlStr) => {
  if (typeof urlStr !== 'string') return urlStr;
  return urlStr.replace(/([?&](token|key|secret|password|auth)=)[^&]+/gi, '$1[REDACTED]');
};

const deepSanitizeAndRedact = (value, key = '', depth = 0) => {
  if (depth > 5) return '[MAX_DEPTH]';
  if (isSensitiveKey(key)) return '[REDACTED]';

  if (typeof value === 'string') {
    return sanitizeString(sanitizeUrlTokens(value));
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => deepSanitizeAndRedact(item, key, depth + 1));
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const sanitizedObj = {};
    const entries = Object.entries(value).slice(0, 50);
    for (const [childKey, childValue] of entries) {
      if (isSensitiveKey(childKey)) {
        sanitizedObj[childKey] = '[REDACTED]';
      } else {
        sanitizedObj[childKey] = deepSanitizeAndRedact(childValue, childKey, depth + 1);
      }
    }
    return sanitizedObj;
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
  }, session = null) {
    const normalizedEventName = eventName || action;
    const normalizedRequestId = requestId || uuidv4();

    try {
      const auditData = {
        eventId: uuidv4(),
        requestId: sanitizeString(normalizedRequestId, 100),
        userId,
        sessionId,
        eventName: normalizedEventName,
        status: status || 'SUCCESS',
        ipAddress: sanitizeString(ipAddress, 100),
        userAgent: sanitizeString(userAgent, 300),
        metadata: deepSanitizeAndRedact(metadata),
        errorMessage: errorMessage ? sanitizeString(String(errorMessage), 500) : null,
        errorCode: errorCode ? sanitizeString(String(errorCode), 100) : null
      };

      const result = await AuditLogRepository.create(auditData, session);

      const logLevel = status === 'FAILURE' ? 'warn' : 'info';
      logger[logLevel]('Authentication/Security audit event recorded', {
        eventName: normalizedEventName,
        userId,
        status,
        requestId: normalizedRequestId
      });

      return result;
    } catch (error) {
      logger.error('Audit write failed', {
        eventName: normalizedEventName,
        requestId: normalizedRequestId,
        errorName: error.name,
        errorCode: error.code,
        message: error.message
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

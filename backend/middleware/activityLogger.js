const ActivityLog = require('../models/ActivityLog');

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
  const neutralized = str.replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').trim();
  return neutralized.slice(0, maxLen);
};

const deepSanitizeAndRedact = (value, key = '', depth = 0) => {
  if (depth > 5) return '[MAX_DEPTH]';
  if (isSensitiveKey(key)) return '[REDACTED]';

  if (typeof value === 'string') {
    return sanitizeString(value);
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

// Auto-log important actions
exports.logActivity = async (req, action, description, details = {}) => {
  try {
    const { resourceType, resourceId, ...otherDetails } = details;

    await ActivityLog.create({
      user: req.user?.id || null,
      action: sanitizeString(action, 100),
      description: sanitizeString(description, 500),
      details: deepSanitizeAndRedact(otherDetails),
      resourceType: resourceType ? sanitizeString(resourceType, 100) : null,
      resourceId: resourceId || null,
      ipAddress: sanitizeString(req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress, 100),
      userAgent: sanitizeString(req.headers?.['user-agent'], 300),
      browser: getBrowser(req.headers?.['user-agent']),
      os: getOS(req.headers?.['user-agent'])
    });
  } catch (error) {
    console.error('Activity logging error (non-fatal):', error);
  }
};

function getBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  return 'Other';
}

function getOS(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS X')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  return 'Other';
}
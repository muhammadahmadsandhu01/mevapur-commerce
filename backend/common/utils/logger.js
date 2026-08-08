const winston = require('winston');
const path = require('path');
const fs = require('fs');

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(?:authorization|cookie|password|passphrase|secret|token|csrf|credential|mongodb|database[_-]?(?:uri|url|name|host)|smtp|email|recipient|customer[_-]?reference|payment[_-]?reference|manual[_-]?reference|provider[_-]?(?:key|secret|transaction))/i;

const redactString = (value) => String(value)
  .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URI]')
  .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
  .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
  .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_PROVIDER_KEY]')
  .replace(/\bwhsec_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_PROVIDER_SECRET]')
  .replace(
    /([?&](?:access_token|refresh_token|token|code|password|secret|key)=)[^&\s]+/gi,
    '$1[REDACTED]'
  )
  .replace(
    /\b(?:authorization|cookie|set-cookie|x-csrf-token)\s*[:=]\s*[^\r\n]+/gi,
    (match) => `${match.split(/[:=]/, 1)[0]}: [REDACTED]`
  )
  .replace(
    /\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s/]+@[^\s]+/gi,
    '[REDACTED_CREDENTIAL_URI]'
  );

const redactValue = (value, key = '', seen = new WeakSet()) => {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (typeof value === 'string') return redactString(value);
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Buffer.isBuffer(value)) return `[BINARY:${value.length}]`;
  if (typeof value.toHexString === 'function') {
    return redactString(value.toHexString());
  }
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, '', seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, entryKey, seen)
    ])
  );
};

const redactionFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    info[key] = redactValue(info[key], key);
  }
  return info;
});

const normalizeEnvironment = (environment) => (
  environment.APP_ENV || environment.NODE_ENV || 'development'
).toLowerCase();

const shouldEnableFileLogging = (environment) => {
  if (environment.LOG_FILE_ENABLED === 'true') return true;
  if (environment.LOG_FILE_ENABLED === 'false') return false;
  return normalizeEnvironment(environment) === 'development';
};

const createCanonicalLogger = (
  environment = process.env,
  { fsModule = fs } = {}
) => {
  const transports = [
    new winston.transports.Console({
      stderrLevels: ['error'],
      consoleWarnLevels: ['warn'],
      format: winston.format.json()
    })
  ];

  if (shouldEnableFileLogging(environment)) {
    const logDir = path.join(__dirname, '../../logs');
    if (!fsModule.existsSync(logDir)) {
      fsModule.mkdirSync(logDir, { recursive: true });
    }
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error'
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log')
      })
    );
  }

  const logger = winston.createLogger({
    level: environment.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      redactionFormat(),
      winston.format.json()
    ),
    defaultMeta: { service: 'mevapur-api' },
    transports,
    exitOnError: false
  });

  logger.orderEvent = (
    eventId,
    orderId,
    userId,
    message,
    metadata = {}
  ) => {
    logger.info(message, {
      event: eventId,
      orderId,
      userId,
      ...metadata
    });
  };

  return logger;
};

const logger = createCanonicalLogger();

module.exports = logger;
module.exports.createCanonicalLogger = createCanonicalLogger;
module.exports.redactString = redactString;
module.exports.redactValue = redactValue;
module.exports.shouldEnableFileLogging = shouldEnableFileLogging;

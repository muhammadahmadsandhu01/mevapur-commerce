const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ======================================================
// Ensure Logs Directory Exists
// ======================================================

const logDir = path.join(__dirname, '../logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ======================================================
// Log Format
// ======================================================

const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({
    stack: true,
  }),
  winston.format.splat(),
  winston.format.json()
);

// ======================================================
// File Transports
// ======================================================

const transports = [
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    handleExceptions: true,
    handleRejections: true,
  }),

  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    handleExceptions: true,
    handleRejections: true,
  }),
];

// ======================================================
// Logger
// ======================================================

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

  format: logFormat,

  defaultMeta: {
    service: 'mevapur-api',
  },

  transports,

  exitOnError: false,
});

// ======================================================
// Console Logging (Development Only)
// ======================================================

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,

      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
          format: 'HH:mm:ss',
        }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    })
  );
}

// ======================================================
// Morgan Stream
// ======================================================

const morganStream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = {
  logger,
  morganStream,
};
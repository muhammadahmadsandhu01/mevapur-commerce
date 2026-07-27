const winston = require('winston');
const path = require('path');

// Ensure logs directory exists (optional in prod, good for dev)
const logDir = path.join(process.cwd(), 'logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mevapur-order-service' },
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
  ]
});

// Console output for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

/**
 * Custom helper for Order Lifecycle Events
 * Ensures every critical step is logged with context
 */
logger.orderEvent = (eventId, orderId, userId, message, metadata = {}) => {
  logger.info({
    event: eventId,          // e.g., 'ORDER_CREATED', 'STOCK_RESERVED'
    orderId,
    userId,
    message,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

module.exports = logger;
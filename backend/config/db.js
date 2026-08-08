const mongoose = require('mongoose');
const logger = require('../common/utils/logger');

let connectionPromise = null;
let closePromise = null;

// ===============================
// Connect MongoDB
// ===============================
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connectionPromise) return connectionPromise;

  if (
    typeof process.env.MONGODB_URI !== 'string'
    || process.env.MONGODB_URI.trim() === ''
  ) {
    const error = new Error('Database configuration is unavailable');
    error.code = 'DATABASE_CONFIGURATION_MISSING';
    throw error;
  }

  closePromise = null;
  connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
      minPoolSize: 5,
      retryWrites: true,
      autoIndex: process.env.NODE_ENV !== 'production',
    })
    .then((connection) => {
      logger.info('Database connection established', {
        reasonCode: 'DATABASE_CONNECTED'
      });
      return connection;
    })
    .catch((error) => {
      logger.error('Database connection failed', {
        reasonCode: 'DATABASE_CONNECT_FAILED'
      });
      throw error;
    })
    .finally(() => {
      connectionPromise = null;
    });

  return connectionPromise;
};

// ===============================
// MongoDB Events
// ===============================

mongoose.connection.on('connected', () => {
  logger.info('Database connection event', {
    reasonCode: 'DATABASE_CONNECTED'
  });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Database disconnected', {
    reasonCode: 'DATABASE_DISCONNECTED'
  });
});

mongoose.connection.on('reconnected', () => {
  logger.info('Database reconnected', {
    reasonCode: 'DATABASE_RECONNECTED'
  });
});

mongoose.connection.on('error', () => {
  logger.error('Database connection event', {
    reasonCode: 'DATABASE_CONNECTION_ERROR'
  });
});

// ===============================
// Graceful Shutdown
// ===============================

const closeDatabase = () => {
  if (!closePromise) {
    closePromise = (async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      logger.info('Database connection closed', {
        reasonCode: 'DATABASE_CLOSED'
      });
    })();
  }
  return closePromise;
};

module.exports = connectDB;
module.exports.closeDatabase = closeDatabase;

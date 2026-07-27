const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../common/utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongo.uri, config.mongo.options);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error('Database connection failed', error);
    process.exit(1);
  }
};

module.exports = connectDB;
const logger = require('../common/utils/logger');

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

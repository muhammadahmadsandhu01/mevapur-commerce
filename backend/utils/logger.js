// Compatibility entry point. Canonical logger ownership lives in
// common/utils/logger.js so all active backend modules share transports,
// structure, and redaction.
module.exports = require('../common/utils/logger');

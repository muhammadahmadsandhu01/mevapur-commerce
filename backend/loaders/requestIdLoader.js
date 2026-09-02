const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const requestIdLoader = (req, res, next) => {
  // Check header first, otherwise generate new
  req.requestId = req.headers['x-request-id'] || uuidv4();
  
  // Set response header so client knows the ID
  res.setHeader('X-Request-ID', req.requestId);
  
  next();
};

module.exports = requestIdLoader;
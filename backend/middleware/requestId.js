const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const requestId = (req, res, next) => {
  const supplied = req.headers['x-request-id'];
  const id = (
    typeof supplied === 'string'
    && supplied.length <= 128
    && /^[A-Za-z0-9._:-]+$/.test(supplied)
  ) ? supplied : uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};

module.exports = requestId;

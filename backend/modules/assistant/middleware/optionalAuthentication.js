const { protect } = require('../../../middleware/auth');

const optionalAuthentication = (req, res, next) => {
  const authorization = req.get('Authorization');
  if (!authorization) {
    req.assistantAudience = 'anonymous';
    return next();
  }

  return protect(req, res, (error) => {
    if (error) return next(error);
    req.assistantAudience = 'customer';
    return next();
  });
};

module.exports = optionalAuthentication;

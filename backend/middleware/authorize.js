const PolicyService = require('../services/PolicyService');
const { AppError } = require('../errors/AppError');

/**
 * Middleware Factory for Authorization
 * Usage: authorize({ resource: 'orders', action: 'create', scope: 'all' })
 */
const authorize = (options) => {
  return async (req, res, next) => {
    try {
      const { resource, action, scope = 'own' } = options;
      const user = req.user;

      if (!user) {
        throw new AppError('Authentication required', 401, 'AUTH_TOKEN_MISSING');
      }

      const isAuthorized = await PolicyService.checkPermission({
        userId: user._id,
        role: user.role,
        resource,
        action,
        scope
      });

      if (!isAuthorized) {
        throw new AppError(
          `You do not have permission to ${action} ${resource}`,
          403,
          'AUTH_PERMISSION_DENIED'
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = authorize;
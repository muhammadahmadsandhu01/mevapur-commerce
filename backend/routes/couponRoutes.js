const express = require('express');
const router = express.Router();
const { protect, requireRoles, superAdmin } = require('../middleware/auth');
const TokenService = require('../services/TokenService');
const UserRepository = require('../repositories/UserRepository');
const SessionRepository = require('../repositories/SessionRepository');
const {
  getCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  disableCoupon,
  archiveCoupon,
  deleteDraftCoupon,
  validateCoupon,
  getCouponStats
} = require('../controllers/couponController');

// Optional authentication middleware for public validate route (extracts user if valid Bearer token provided)
const optionalAuth = async (req, res, next) => {
  try {
    const authorization = req.get('Authorization');
    const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i) : null;
    if (match) {
      const decoded = TokenService.verifyAccessToken(match[1]);
      if (decoded && decoded.sub) {
        const user = await UserRepository.findByIdWithTokenVersion(decoded.sub);
        if (user && !user.isDeleted) {
          req.user = user.toJSON();
        }
      }
    }
  } catch (err) {
    // Ignore invalid tokens in optional auth
  }
  next();
};

// PUBLIC VALIDATION ROUTE (non-binding preview)
router.post('/validate', optionalAuth, validateCoupon);

// PROTECTED ADMIN ROUTES
router.use(protect);

router.get('/stats', requireRoles('support', 'manager', 'admin', 'super_admin'), getCouponStats);
router.get('/', requireRoles('support', 'manager', 'admin', 'super_admin'), getCoupons);
router.get('/:id', requireRoles('support', 'manager', 'admin', 'super_admin'), getCoupon);
router.post('/', requireRoles('manager', 'admin', 'super_admin'), createCoupon);
router.put('/:id', requireRoles('manager', 'admin', 'super_admin'), updateCoupon);
router.patch('/:id/disable', requireRoles('manager', 'admin', 'super_admin'), disableCoupon);
router.patch('/:id/archive', requireRoles('manager', 'admin', 'super_admin'), archiveCoupon);
router.delete('/:id/draft', superAdmin, deleteDraftCoupon);
router.delete('/:id', superAdmin, deleteDraftCoupon);

module.exports = router;
const express = require('express');
const router = express.Router();
const { protect, optionalAuth, requireRoles, superAdmin } = require('../middleware/auth');
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

// PUBLIC VALIDATION ROUTE (non-binding preview with optional authentication)
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
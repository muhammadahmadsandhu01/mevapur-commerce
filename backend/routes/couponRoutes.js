const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  getCouponStats
} = require('../controllers/couponController');

// PUBLIC ROUTE (Must be defined BEFORE admin middleware)
router.post('/validate', validateCoupon);

// ADMIN ONLY ROUTES (Protected)
router.use(protect);
router.use(admin);

router.get('/stats', getCouponStats);
router.get('/', getCoupons);
router.get('/:id', getCoupon);
router.post('/', createCoupon);
router.put('/:id', updateCoupon);
router.delete('/:id', deleteCoupon);

module.exports = router;
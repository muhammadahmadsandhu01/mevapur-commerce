const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponStats
} = require('../controllers/couponController');

router.use(protect, admin);

router.get('/stats', getCouponStats);
router.get('/', getCoupons);
router.get('/:id', getCoupon);
router.post('/', createCoupon);
router.put('/:id', updateCoupon);
router.delete('/:id', deleteCoupon);

module.exports = router;
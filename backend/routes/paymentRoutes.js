const express = require('express');
const router = express.Router();

const {
  createPaymentIntent,
  verifyStripePayment,
  createJazzCashPayment
} = require('../controllers/paymentController');

const { protect } = require('../middleware/authMiddleware');

/*
|--------------------------------------------------------------------------
| Stripe
|--------------------------------------------------------------------------
*/

// Create Stripe Payment Intent
router.post(
  '/create-payment-intent',
  protect,
  createPaymentIntent
);

// Verify Stripe Payment
router.post(
  '/verify',
  protect,
  verifyStripePayment
);

/*
|--------------------------------------------------------------------------
| JazzCash
|--------------------------------------------------------------------------
*/

// Create JazzCash Payment
router.post(
  '/jazzcash/create',
  protect,
  createJazzCashPayment
);

module.exports = router;
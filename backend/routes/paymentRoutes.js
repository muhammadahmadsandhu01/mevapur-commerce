const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth'); // Assuming auth middleware exists
const validate = require('../middleware/validate');
const { createPaymentSchema, refundSchema } = require('../validators/paymentValidator'); // You'd create this similar to orderValidator

// Public Webhooks (No auth, signature verified inside)
router.post('/webhook/:gateway', express.raw({ type: 'application/json' }), (req, res, next) => {
  // Middleware to parse JSON but keep raw buffer for signature check would go here
  // For simplicity, assuming controller handles it or custom middleware used
  paymentController.handleWebhook(req, res, next);
});

// Protected Routes
router.post('/', protect, paymentController.createPayment);
router.post('/:id/refund', protect, paymentController.refundPayment);

module.exports = router;
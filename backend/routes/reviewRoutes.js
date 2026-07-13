const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getReviews,
  approveReview,
  deleteReview,
  getReviewStats,
  reportReview
} = require('../controllers/reviewController');

// Public routes
router.post('/:id/report', reportReview);

// Admin routes
router.get('/stats', protect, admin, getReviewStats);
router.get('/', protect, admin, getReviews);
router.put('/:id/approve', protect, admin, approveReview);
router.delete('/:id', protect, admin, deleteReview);

module.exports = router;
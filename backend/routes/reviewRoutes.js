const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getReviews,
  updateReview,      
  deleteReview,
  getReviewStats,
  reportReview
} = require('../controllers/reviewController');

// Public routes
router.post('/:id/report', reportReview);

// Admin routes
router.get('/stats', protect, admin, getReviewStats);
router.get('/', protect, admin, getReviews);

// 🌟 Generic update route handles approve, reject, flag, and reply
router.put('/:id', protect, admin, updateReview);

router.delete('/:id', protect, admin, deleteReview);

module.exports = router;
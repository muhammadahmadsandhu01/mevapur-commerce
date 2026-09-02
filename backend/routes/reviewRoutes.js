const express = require('express');
const router = express.Router();
const { protect, requireRoles, superAdmin } = require('../middleware/auth');
const {
  getReviews,
  getReviewStats,
  approveReview,
  rejectReview,
  flagReview,
  replyReview,
  reportReview,
  resolveReport,
  exceptionalErase,
  updateReview,
  deleteReview
} = require('../controllers/reviewController');

// All review admin routes require authentication
router.use(protect);

// Global Stats & Listing
router.get('/stats', requireRoles('support', 'manager', 'admin', 'super_admin'), getReviewStats);
router.get('/', requireRoles('support', 'manager', 'admin', 'super_admin'), getReviews);

// Customer Reporting (Canonical customer role only)
router.post('/:id/reports', requireRoles('customer'), reportReview);

// Moderator Actions
router.patch('/:id/approve', requireRoles('manager', 'admin', 'super_admin'), approveReview);
router.patch('/:id/reject', requireRoles('manager', 'admin', 'super_admin'), rejectReview);
router.patch('/:id/flag', requireRoles('manager', 'admin', 'super_admin'), flagReview);
router.patch('/:id/reply', requireRoles('manager', 'admin', 'super_admin'), replyReview);
router.patch('/:id/reports/:reportId/resolve', requireRoles('manager', 'admin', 'super_admin'), resolveReport);

// SuperAdmin Exceptional Legal Erasure
router.delete('/:id/exceptional-erase', superAdmin, exceptionalErase);

// Legacy Compatibility Routes
router.post('/:id/report', requireRoles('customer'), reportReview);
router.put('/:id', requireRoles('manager', 'admin', 'super_admin'), updateReview);
router.delete('/:id', requireRoles('admin', 'super_admin'), deleteReview);

module.exports = router;

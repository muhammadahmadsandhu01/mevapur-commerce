const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');

// Deprecation notice for legacy mutation routes (canonical route is /api/admin/categories)
// RFC 9745 Structured Field Date: @1789084800 (2026-09-11 00:00:00 UTC)
const deprecateLegacyMutation = (req, res, next) => {
  res.set('Deprecation', '@1789084800');
  res.set('X-API-Deprecated', 'true');
  res.set('X-API-Replacement', '/api/admin/categories');
  next();
};

// Public Category Endpoints (Active categories only)
router.route('/')
  .get(getCategories)
  // Legacy mutation compatibility alias (Deprecated: Use POST /api/admin/categories)
  .post(protect, admin, deprecateLegacyMutation, createCategory);

router.route('/:id')
  .get(getCategoryById)
  // Legacy mutation compatibility aliases (Deprecated: Use PUT/DELETE /api/admin/categories/:id)
  .put(protect, admin, deprecateLegacyMutation, updateCategory)
  .delete(protect, admin, deprecateLegacyMutation, deleteCategory);

module.exports = router;
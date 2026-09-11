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
const deprecateLegacyMutation = (req, res, next) => {
  res.set('X-API-Deprecated', 'Use /api/admin/categories instead');
  res.set('Deprecation', '@true');
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
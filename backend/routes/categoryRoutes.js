const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryStats
} = require('../controllers/categoryController');

// Public routes
router.get('/', getCategories);
router.get('/stats', protect, admin, getCategoryStats);
router.get('/:id', getCategory);

// Protected routes (Admin only)
router.post('/', protect, admin, createCategory);
router.put('/:id', protect, admin, updateCategory);
router.delete('/:id', protect, admin, deleteCategory);

module.exports = router;
const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  getTopProducts
} = require('../controllers/productController');

// Public routes
router.get('/', getProducts);
router.get('/top', getTopProducts);
router.get('/:id', getProduct);

// Protected routes (Admin only)
router.post('/', protect, admin, createProduct);
router.put('/:id', protect, admin, updateProduct);
router.delete('/:id', protect, admin, deleteProduct);
router.post('/bulk-delete', protect, admin, bulkDeleteProducts);

module.exports = router;
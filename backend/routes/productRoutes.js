const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const ERROR_CODES = require('../constants/errorCodes');
const { productQuerySchema } = require('../validators/commercialCoreValidator');

const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  getTopProducts,
  getRecentlyViewed,
  getRecommendedProducts
} = require('../controllers/productController');

// Public routes
router.get('/', validate(productQuerySchema, { source: 'query', code: ERROR_CODES.COMMERCIAL_CORE_VALIDATION_FAILED }), getProducts);
router.get('/top', getTopProducts);
router.get('/recently-viewed', getRecentlyViewed);
router.get('/recommended', getRecommendedProducts);
router.get('/:id', getProduct);

// Protected routes (Admin only)
router.post('/', protect, admin, createProduct);
router.put('/:id', protect, admin, updateProduct);
router.delete('/:id', protect, admin, deleteProduct);
router.post('/bulk-delete', protect, admin, bulkDeleteProducts);

module.exports = router;

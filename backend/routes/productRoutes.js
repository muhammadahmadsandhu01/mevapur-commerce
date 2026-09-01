const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const ERROR_CODES = require('../constants/errorCodes');
const { productQuerySchema } = require('../validators/commercialCoreValidator');

const {
  getProducts,
  getProduct,
  getTopProducts,
  getRecentlyViewed,
  getRecommendedProducts
} = require('../controllers/productController');

// Public catalog endpoints (Strictly published products only, zero admin bypass)
router.get('/', validate(productQuerySchema, { source: 'query', code: ERROR_CODES.COMMERCIAL_CORE_VALIDATION_FAILED }), getProducts);
router.get('/top', getTopProducts);
router.get('/recently-viewed', getRecentlyViewed);
router.get('/recommended', getRecommendedProducts);
router.get('/:id', getProduct);

module.exports = router;

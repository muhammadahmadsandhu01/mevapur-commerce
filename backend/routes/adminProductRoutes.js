const express = require('express');
const router = express.Router();
const { protect, checkRoles, superAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { CANONICAL_ROLES } = require('../constants/roleConstants');
const {
  draftCreateSchema,
  publishedCreateSchema,
  productUpdateSchema,
  adminProductQuerySchema
} = require('../validators/productValidator');
const {
  offeringBodySchema,
  priceBodySchema
} = require('../validators/offeringValidator');
const {
  getAdminProducts,
  getAdminProduct,
  createProduct,
  updateProduct,
  publishProduct,
  unpublishProduct,
  archiveProduct,
  deleteProduct,
  getProductOfferings,
  updateProductOfferings,
  getProductPrices,
  updateProductPrices
} = require('../controllers/adminProductController');

// All admin product routes require authentication and staff authorization
router.use(protect);
router.use(checkRoles(
  CANONICAL_ROLES.ADMIN,
  CANONICAL_ROLES.SUPER_ADMIN,
  CANONICAL_ROLES.MANAGER
));

router.get('/', validate(adminProductQuerySchema, { source: 'query' }), getAdminProducts);
router.get('/:id', getAdminProduct);

// Market Offering and Price Book endpoints
router.get('/:id/offerings', getProductOfferings);
router.put('/:id/offerings', validate(offeringBodySchema), updateProductOfferings);
router.post('/:id/offerings', validate(offeringBodySchema), updateProductOfferings);

router.get('/:id/prices', getProductPrices);
router.put('/:id/prices', validate(priceBodySchema), updateProductPrices);
router.post('/:id/prices', validate(priceBodySchema), updateProductPrices);

// Explicit draft vs publish creation routes
router.post('/draft', validate(draftCreateSchema), createProduct);
router.post('/', validate(publishedCreateSchema), createProduct);

router.put('/:id', validate(productUpdateSchema), updateProduct);

router.post('/:id/publish', publishProduct);
router.post('/:id/unpublish', unpublishProduct);
router.post('/:id/archive', archiveProduct);

// Hard delete restricted strictly to super_admin
router.delete('/:id', superAdmin, deleteProduct);

module.exports = router;

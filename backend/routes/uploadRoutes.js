const express = require('express');
const router = express.Router();
const { protect, checkRoles } = require('../middleware/auth');
const { CANONICAL_ROLES } = require('../constants/roleConstants');
const { uploadMiddleware, uploadSingleImage } = require('../controllers/uploadController');

// Uploads require authenticated staff members
router.use(protect);
router.use(checkRoles(
  CANONICAL_ROLES.ADMIN,
  CANONICAL_ROLES.SUPER_ADMIN,
  CANONICAL_ROLES.MANAGER
));

router.post('/product-image', uploadMiddleware.single('image'), uploadSingleImage);

module.exports = router;

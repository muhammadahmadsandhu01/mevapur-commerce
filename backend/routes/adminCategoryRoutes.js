const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getAdminCategories,
  getAdminCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');

// All admin category routes require authentication and admin/super_admin authorization
router.use(protect);
router.use(admin);

router.route('/')
  .get(getAdminCategories)
  .post(createCategory);

router.route('/:id')
  .get(getAdminCategoryById)
  .put(updateCategory)
  .delete(deleteCategory);

module.exports = router;

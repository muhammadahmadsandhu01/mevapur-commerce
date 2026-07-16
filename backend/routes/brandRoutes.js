const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand
} = require('../controllers/brandController');

router.route('/')
  .get(getBrands)
  .post(protect, admin, createBrand);

router.route('/:id')
  .put(protect, admin, updateBrand)
  .delete(protect, admin, deleteBrand);

module.exports = router;
const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  getBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandStats
} = require('../controllers/brandController');

// Public routes
router.get('/', getBrands);
router.get('/stats', protect, admin, getBrandStats);
router.get('/:id', getBrand);

// Protected routes (Admin only)
router.post('/', protect, admin, createBrand);
router.put('/:id', protect, admin, updateBrand);
router.delete('/:id', protect, admin, deleteBrand);

module.exports = router;
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const slugify = require('slugify');

// @desc    Get all brands
// @route   GET /api/brands
// @access  Public
exports.getBrands = async (req, res) => {
  try {
    // Return all brands so admin can see and reactivate inactive ones
    const brands = await Brand.find({}).sort({ name: 1 });
    res.json({ success: true, data: brands });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create brand (Admin)
// @route   POST /api/brands
// @access  Private/Admin
exports.createBrand = async (req, res) => {
  try {
    // Auto-generate slug if not provided
    if (!req.body.slug && req.body.name) {
      req.body.slug = slugify(req.body.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
    }

    const brand = await Brand.create(req.body);
    res.status(201).json({ success: true, data: brand });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Brand with this name or slug already exists' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update brand (Admin)
// @route   PUT /api/brands/:id
// @access  Private/Admin
exports.updateBrand = async (req, res) => {
  try {
    // Auto-generate slug if name is modified and slug is not explicitly provided
    if (req.body.name && !req.body.slug) {
      req.body.slug = slugify(req.body.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
    }

    const brand = await Brand.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    );
    
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }
    
    res.json({ success: true, data: brand });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Brand with this name or slug already exists' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete brand (Admin)
// @route   DELETE /api/brands/:id
// @access  Private/Admin
exports.deleteBrand = async (req, res) => {
  try {
    // 🌟 Check if any products are using this brand (Prevents orphaned products)
    const productsCount = await Product.countDocuments({ brand: req.params.id });
    
    if (productsCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete brand. It is currently assigned to ${productsCount} product(s). Please reassign or delete those products first.` 
      });
    }
    
    await Brand.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Brand removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
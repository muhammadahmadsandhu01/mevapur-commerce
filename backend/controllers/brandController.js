const Brand = require('../models/Brand');
const { logActivity } = require('../middleware/activityLogger');  

// @desc    Get all brands
// @route   GET /api/brands
// @access  Public
exports.getBrands = async (req, res) => {
  try {
    const brands = await Brand.find().sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: brands
    });
  } catch (error) {
    console.error('Get brands error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single brand
// @route   GET /api/brands/:id
// @access  Public
exports.getBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    res.json({
      success: true,
      data: brand
    });
  } catch (error) {
    console.error('Get brand error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create brand
// @route   POST /api/brands
// @access  Private/Admin
exports.createBrand = async (req, res) => {
  try {
    const { name, description, logo, website, isFeatured } = req.body;

    const brand = await Brand.create({
      name,
      description,
      logo,
      website,
      isFeatured: isFeatured || false,
      slug: name.toLowerCase().replace(/ /g, '-')
    });

    await logActivity(req, 'BRAND_CREATE', 
      `Created brand: ${brand.name}`, 
      { brandId: brand._id, brandName: brand.name }
    );

    res.status(201).json({
      success: true,
      message: 'Brand created successfully',
      data: brand
    });
  } catch (error) {
    console.error('Create brand error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update brand
// @route   PUT /api/brands/:id
// @access  Private/Admin
exports.updateBrand = async (req, res) => {
  try {
    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    await logActivity(req, 'BRAND_UPDATE', 
      `Updated brand: ${brand.name}`, 
      { brandId: brand._id, brandName: brand.name, changes: req.body }
    );

    res.json({
      success: true,
      message: 'Brand updated successfully',
      data: brand
    });
  } catch (error) {
    console.error('Update brand error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete brand
// @route   DELETE /api/brands/:id
// @access  Private/Admin
exports.deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findByIdAndDelete(req.params.id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    await logActivity(req, 'BRAND_DELETE', 
      `Deleted brand: ${brand.name}`, 
      { brandId: brand._id, brandName: brand.name }
    );

    res.json({
      success: true,
      message: 'Brand deleted successfully'
    });
  } catch (error) {
    console.error('Delete brand error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get brand statistics
// @route   GET /api/brands/stats
// @access  Private/Admin
exports.getBrandStats = async (req, res) => {
  try {
    const totalBrands = await Brand.countDocuments();
    const activeBrands = await Brand.countDocuments({ isActive: true });
    const featuredBrands = await Brand.countDocuments({ isFeatured: true });

    res.json({
      success: true,
      data: {
        totalBrands,
        activeBrands,
        featuredBrands
      }
    });
  } catch (error) {
    console.error('Brand stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
const Category = require('../models/Category');
const { logActivity } = require('../middleware/activityLogger');  

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().populate('parent', 'name');
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Public
exports.getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('parent', 'name')
      .populate('subcategories', 'name');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create category
// @route   POST /api/categories
// @access  Private/Admin
exports.createCategory = async (req, res) => {
  try {
    const { name, description, parent, image, slug } = req.body;

    const category = await Category.create({
      name,
      description,
      parent: parent || null,
      image,
      slug: slug || name.toLowerCase().replace(/ /g, '-')
    });

    if (parent) {
      await Category.findByIdAndUpdate(parent, {
        $push: { subcategories: category._id }
      });
    }

    await logActivity(req, 'CATEGORY_CREATE', 
      `Created category: ${category.name}`, 
      { 
        categoryId: category._id,
        categoryName: category.name,
        parentCategory: parent
      }
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // ✅ YE LINE ADD KAREIN
    await logActivity(req, 'CATEGORY_UPDATE', 
      `Updated category: ${category.name}`, 
      { 
        categoryId: category._id,
        categoryName: category.name,
        changes: req.body
      }
    );

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    if (category.subcategories && category.subcategories.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with subcategories'
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    if (category.parent) {
      await Category.findByIdAndUpdate(category.parent, {
        $pull: { subcategories: category._id }
      });
    }

    await logActivity(req, 'CATEGORY_DELETE', 
      `Deleted category: ${category.name}`, 
      { 
        categoryId: category._id,
        categoryName: category.name
      }
    );

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get category statistics
// @route   GET /api/categories/stats
// @access  Private/Admin
exports.getCategoryStats = async (req, res) => {
  try {
    const totalCategories = await Category.countDocuments();
    const parentCategories = await Category.countDocuments({ parent: null });
    const subcategories = await Category.countDocuments({ parent: { $ne: null } });

    res.json({
      success: true,
      data: {
        totalCategories,
        parentCategories,
        subcategories
      }
    });
  } catch (error) {
    console.error('Category stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
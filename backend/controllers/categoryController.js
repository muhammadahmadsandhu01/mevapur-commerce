const Category = require('../models/Category');

// @desc    Get all categories (with hierarchy)
// @route   GET /api/categories
// @access  Public
exports.getCategories = async (req, res) => {
  try {
    // Get main categories (parentId is null)
    const mainCategories = await Category.find({ parentId: null, isActive: true })
      .sort({ displayOrder: 1 })
      .lean();

    // Get all subcategories
    const subcategories = await Category.find({ isActive: true }).lean();

    // Build hierarchy tree
    const categoriesWithChildren = mainCategories.map(mainCat => {
      const children = subcategories.filter(sub => sub.parentId.toString() === mainCat._id.toString());
      return { ...mainCat, children };
    });

    res.json({ success: true, data: categoriesWithChildren });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single category by slug or ID
// @route   GET /api/categories/:id
// @access  Public
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findOne({ 
      $or: [{ _id: req.params.id }, { slug: req.params.id }],
      isActive: true 
    });
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create category (Admin)
// @route   POST /api/categories
// @access  Private/Admin
exports.createCategory = async (req, res) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update category (Admin)
// @route   PUT /api/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete category (Admin)
// @route   DELETE /api/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res) => {
  try {
    // Check if it has subcategories or products (Optional safety check)
    const subcategories = await Category.countDocuments({ parentId: req.params.id });
    if (subcategories > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete category with subcategories' });
    }
    
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Category removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
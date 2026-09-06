const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const slugify = require('slugify');

async function normalizeAndValidateParentId(parentId, currentCategoryId = null) {
  if (parentId === undefined) {
    return { hasValue: false, value: undefined };
  }

  if (parentId === null || (typeof parentId === 'string' && parentId.trim() === '')) {
    return { hasValue: true, value: null };
  }

  const rawId = typeof parentId === 'string' ? parentId.trim() : parentId.toString();

  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    return { error: 'Invalid parent category ID' };
  }

  if (currentCategoryId && currentCategoryId.toString() === rawId) {
    return { error: 'Category cannot be its own parent' };
  }

  const parentCategory = await Category.findById(rawId);
  if (!parentCategory) {
    return { error: 'Parent category not found' };
  }

  // Prevent cyclic hierarchies: ensure currentCategory is not an ancestor of the proposed parent
  if (currentCategoryId) {
    let ancestor = parentCategory;
    while (ancestor && ancestor.parentId) {
      if (ancestor.parentId.toString() === currentCategoryId.toString()) {
        return { error: 'Cyclic category hierarchy is not allowed' };
      }
      ancestor = await Category.findById(ancestor.parentId);
    }
  }

  return { hasValue: true, value: parentCategory._id };
}

// @desc    Get all categories (Flat list for easy Admin management)
// @route   GET /api/categories
// @access  Public
exports.getCategories = async (req, res) => {
  try {
    // Flat list return karna admin CRUD ke liye behtar hai
    const categories = await Category.find({})
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single category by slug or ID
// @route   GET /api/categories/:id
// @access  Public
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findOne({ 
      $or: [{ _id: req.params.id }, { slug: req.params.id }]
    });
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create category (Admin)
// @route   POST /api/categories
// @access  Private/Admin
exports.createCategory = async (req, res) => {
  try {
    const payload = { ...req.body };

    // Auto-generate slug if not provided
    if (!payload.slug && payload.name) {
      payload.slug = slugify(payload.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
    }

    if ('parentId' in payload) {
      const parentCheck = await normalizeAndValidateParentId(payload.parentId);
      if (parentCheck.error) {
        return res.status(400).json({ success: false, message: parentCheck.error });
      }
      if (parentCheck.hasValue) {
        payload.parentId = parentCheck.value;
      }
    }

    const category = await Category.create(payload);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category with this name or slug already exists' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update category (Admin)
// @route   PUT /api/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res) => {
  try {
    const payload = { ...req.body };

    // Auto-generate slug if name is modified and slug is not explicitly provided
    if (payload.name && !payload.slug) {
      payload.slug = slugify(payload.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
    }

    if ('parentId' in payload) {
      const parentCheck = await normalizeAndValidateParentId(payload.parentId, req.params.id);
      if (parentCheck.error) {
        return res.status(400).json({ success: false, message: parentCheck.error });
      }
      if (parentCheck.hasValue) {
        payload.parentId = parentCheck.value;
      }
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    res.json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category with this name or slug already exists' });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete category (Admin)
// @route   DELETE /api/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res) => {
  try {
    // 1. Check if it has subcategories
    const subcategories = await Category.countDocuments({ parentId: req.params.id });
    if (subcategories > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete category. Please delete or reassign its subcategories first.' 
      });
    }
    
    // 2. 🌟 Check if any products are using this category (Prevents orphaned products)
    const productsCount = await Product.countDocuments({ 
      $or: [{ category: req.params.id }, { subcategory: req.params.id }] 
    });
    
    if (productsCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete category. It is currently assigned to ${productsCount} product(s).` 
      });
    }
    
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Category removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
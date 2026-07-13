const Product = require('../models/Product');
const { logActivity } = require('../middleware/activityLogger');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      category = '',
      brand = '',
      minPrice = '',
      maxPrice = '',
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    // Build query
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) {
      query.category = category;
    }

    if (brand) {
      query.brand = brand;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Pagination
    const skip = (page - 1) * limit;
    const total = await Product.countDocuments(query);
    const pages = Math.ceil(total / limit);

    // Sort
    const sortOptions = {};
    sortOptions[sortBy] = order === 'desc' ? -1 : 1;

    const products = await Product.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = async (req, res) => {
  try {
    console.log(' Creating product:', req.body);

    const productData = {
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      originalPrice: req.body.originalPrice || 0,
      discount: req.body.discount || 0,
      category: req.body.category,
      subcategory: req.body.subcategory,
      brand: req.body.brand,
      sku: req.body.sku,
      stock: req.body.stock || 0,
      images: req.body.images || [],
      highlights: req.body.highlights || [],
      specifications: req.body.specifications || {},
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    };

    const product = await Product.create(productData);

    console.log('✅ Product created:', product._id);

    await logActivity(req, 'PRODUCT_CREATE', `Created product: ${product.name}`, { 
      productId: product._id,
      productName: product.name,
      price: product.price
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res) => {
  try {
    console.log('🔄 Updating product:', req.params.id);

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.log('✅ Product updated:', product._id);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res) => {
  try {
    console.log('🗑️ Deleting product:', req.params.id);

    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.log('✅ Product deleted:', product._id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Bulk delete products
// @route   POST /api/products/bulk-delete
// @access  Private/Admin
exports.bulkDeleteProducts = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide product IDs to delete'
      });
    }

    console.log('️ Bulk deleting products:', productIds);

    const result = await Product.deleteMany({ _id: { $in: productIds } });

    console.log(`✅ Deleted ${result.deletedCount} products`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} products`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get top selling products
// @route   GET /api/products/top
// @access  Public
exports.getTopProducts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const products = await Product.find()
      .sort({ soldCount: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Top products error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
const Product = require('../models/Product');
const mongoose = require('mongoose');

// @desc    Get all products with advanced filtering, sorting, pagination
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;

    const query = {};

    // 1. Text Search
    if (req.query.keyword) {
      query.$or = [
        { name: { $regex: req.query.keyword, $options: 'i' } },
        { brand: { $regex: req.query.keyword, $options: 'i' } },
        { sku: { $regex: req.query.keyword, $options: 'i' } },
        { description: { $regex: req.query.keyword, $options: 'i' } }
      ];
    }

    // 2. Category Filter
    if (req.query.category) {
      const categories = req.query.category.split(',');
      query.category = { $in: categories };
    }

    // 3. Brand Filter
    if (req.query.brand) {
      const brands = req.query.brand.split(',');
      query.brand = { $in: brands };
    }

    // 4. Price Range Filter
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
    }

    // 5. Rating Filter
    if (req.query.rating) {
      query.rating = { $gte: parseFloat(req.query.rating) };
    }

    // 6. Stock Availability
    if (req.query.inStock === 'true') {
      query.stock = { $gt: 0 };
    } else if (req.query.inStock === 'false') {
      query.stock = { $lte: 0 };
    }

    // Sorting
    let sortOption = {};
    if (req.query.sortBy === 'price-asc') sortOption = { price: 1 };
    else if (req.query.sortBy === 'price-desc') sortOption = { price: -1 };
    else if (req.query.sortBy === 'rating') sortOption = { rating: -1, numReviews: -1 };
    else if (req.query.sortBy === 'best-selling') sortOption = { numReviews: -1 };
    else sortOption = { createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(query).sort(sortOption).limit(limit).skip(skip).select('-reviews -__v'),
      Product.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: products,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
        limit
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single product (RENAMED from getProductById to match routes)
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = async (req, res) => {
  try {
    const product = new Product(req.body);
    const createdProduct = await product.save();
    res.status(201).json({ success: true, data: createdProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    await product.deleteOne();
    res.json({ success: true, message: 'Product removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk delete products
// @route   POST /api/products/bulk-delete
// @access  Private/Admin
exports.bulkDeleteProducts = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No product IDs provided' });
    }
    await Product.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: 'Products deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get top products
// @route   GET /api/products/top
// @access  Public
exports.getTopProducts = async (req, res) => {
  try {
    const products = await Product.find({}).sort({ rating: -1, numReviews: -1 }).limit(5);
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recently viewed products
// @route   GET /api/products/recently-viewed
// @access  Public
exports.getRecentlyViewed = async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) {
      return res.json({ success: true, data: [] });
    }
    const productIds = ids.split(',').filter(id => mongoose.Types.ObjectId.isValid(id));
    const products = await Product.find({ _id: { $in: productIds } }).select('-reviews -__v').limit(10);
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recommended products
// @route   GET /api/products/recommended
// @access  Public
exports.getRecommendedProducts = async (req, res) => {
  try {
    const { categoryId, limit = 8 } = req.query;
    let query = {};
    if (categoryId) query.category = categoryId;
    
    const products = await Product.find(query).sort({ rating: -1, numReviews: -1 }).limit(parseInt(limit, 10)).select('-reviews -__v');
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
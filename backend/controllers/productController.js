const Product = require('../models/Product');
const mongoose = require('mongoose');

// @desc    Get all products for public storefront
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const skip = (page - 1) * limit;

    // Public catalog strictly requires published active products
    const query = { isActive: true, status: 'published' };
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Text Search
    if (req.query.keyword) {
      query.$or = [
        { name: { $regex: escapeRegex(req.query.keyword), $options: 'i' } },
        { sku: { $regex: escapeRegex(req.query.keyword), $options: 'i' } },
        { description: { $regex: escapeRegex(req.query.keyword), $options: 'i' } }
      ];
    }

    // 2. Category Filter
    if (req.query.category && mongoose.Types.ObjectId.isValid(req.query.category)) {
      query.category = new mongoose.Types.ObjectId(req.query.category);
    }

    if (req.query.subcategory && mongoose.Types.ObjectId.isValid(req.query.subcategory)) {
      query.subcategory = new mongoose.Types.ObjectId(req.query.subcategory);
    }

    // 3. Brand Filter
    if (req.query.brand && mongoose.Types.ObjectId.isValid(req.query.brand)) {
      query.brand = new mongoose.Types.ObjectId(req.query.brand);
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
    if (req.query.inStock === 'true') query.stock = { $gt: 0 };
    else if (req.query.inStock === 'false') query.stock = { $lte: 0 };

    // 7. Dynamic Attribute Filtering
    if (req.query.attribute && typeof req.query.attribute === 'object') {
      query.$and = query.$and || [];
      Object.keys(req.query.attribute).forEach(key => {
        const values = Array.isArray(req.query.attribute[key]) ? req.query.attribute[key] : [req.query.attribute[key]];
        query.$and.push({
          attributes: { $elemMatch: { name: key, value: { $in: values } } }
        });
      });
    }

    // Autocomplete search
    if (req.query.autocomplete === 'true') {
      const products = await Product.find(query)
        .select('name slug price image primaryImage category')
        .populate('category', 'name slug')
        .sort({ name: 1 })
        .limit(limit)
        .lean();

      const formattedProducts = products.map((product) => ({
        _id: product._id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        image: product.image || product.primaryImage || '/placeholder.png',
        category: product.category
      }));

      return res.json({ success: true, data: formattedProducts });
    }

    // 8. Sorting
    let sortOption = {};
    if (req.query.sortBy === 'price-asc') sortOption = { price: 1, _id: -1 };
    else if (req.query.sortBy === 'price-desc') sortOption = { price: -1, _id: -1 };
    else if (req.query.sortBy === 'rating') sortOption = { rating: -1, reviewCount: -1, _id: -1 };
    else if (req.query.sortBy === 'best-selling') sortOption = { soldCount: -1, _id: -1 };
    else sortOption = { createdAt: -1, _id: -1 };

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOption)
        .limit(limit)
        .skip(skip)
        .populate('category', 'name slug')
        .populate('brand', 'name')
        .select('-__v')
        .lean(),
      Product.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: products,
      pagination: {
        page,
        pages: Math.ceil(total / limit) || 1,
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
        limit
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single published product by ID or Slug
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    let product = null;
    if (isValidObjectId) {
      product = await Product.findOne({ _id: id, isActive: true, status: 'published' })
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('brand', 'name')
        .lean();
    }

    if (!product) {
      product = await Product.findOne({ slug: id, isActive: true, status: 'published' })
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('brand', 'name')
        .lean();
    }

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch product details' });
  }
};

// @desc    Get top rated published products
// @route   GET /api/products/top
// @access  Public
exports.getTopProducts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    const products = await Product.find({ isActive: true, status: 'published' })
      .sort({ rating: -1, reviewCount: -1, _id: -1 })
      .limit(limit)
      .populate('category', 'name slug')
      .populate('brand', 'name')
      .lean();

    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recommended published products
// @route   GET /api/products/recommended
// @access  Public
exports.getRecommendedProducts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
    const products = await Product.find({ isActive: true, status: 'published' })
      .sort({ isFeatured: -1, rating: -1, soldCount: -1, _id: -1 })
      .limit(limit)
      .populate('category', 'name slug')
      .populate('brand', 'name')
      .lean();

    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recently viewed published products
// @route   GET /api/products/recently-viewed
// @access  Public
exports.getRecentlyViewed = async (req, res) => {
  try {
    const ids = req.query.ids ? req.query.ids.split(',').filter(id => mongoose.Types.ObjectId.isValid(id)) : [];
    if (ids.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const products = await Product.find({
      _id: { $in: ids },
      isActive: true,
      status: 'published'
    })
      .populate('category', 'name slug')
      .populate('brand', 'name')
      .lean();

    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

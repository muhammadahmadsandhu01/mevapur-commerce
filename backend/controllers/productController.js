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

    // Build query object
    const query = {};

    // 1. Text Search (Name, SKU, Brand, Description)
    if (req.query.keyword) {
      query.$or = [
        { name: { $regex: req.query.keyword, $options: 'i' } },
        { brand: { $regex: req.query.keyword, $options: 'i' } },
        { sku: { $regex: req.query.keyword, $options: 'i' } },
        { description: { $regex: req.query.keyword, $options: 'i' } }
      ];
    }

    // 2. Category Filter (Multi-select)
    if (req.query.category) {
      const categories = req.query.category.split(',');
      query.category = { $in: categories };
    }

    // 3. Brand Filter (Multi-select)
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

    // 7. Discount Filter
    if (req.query.discount) {
      const discountPercent = parseFloat(req.query.discount);
      query.$expr = {
        $gte: [
          { $multiply: [{ $subtract: ['$originalPrice', '$price'] }, 100, { $divide: ['$originalPrice', 1] }] },
          discountPercent
        ]
      };
    }

    // 8. Product Attributes (Dynamic)
    if (req.query.attributes) {
      const attributes = JSON.parse(req.query.attributes);
      Object.keys(attributes).forEach(key => {
        query[`attributes.${key}`] = { $in: attributes[key].split(',') };
      });
    }

    // 9. Delivery Options
    if (req.query.freeShipping === 'true') {
      query.freeShipping = true;
    }
    if (req.query.expressDelivery === 'true') {
      query.expressDelivery = true;
    }
    if (req.query.cod === 'true') {
      query.codAvailable = true;
    }

    // Sorting
    let sortOption = {};
    if (req.query.sortBy) {
      switch (req.query.sortBy) {
        case 'price-asc':
          sortOption = { price: 1 };
          break;
        case 'price-desc':
          sortOption = { price: -1 };
          break;
        case 'rating':
          sortOption = { rating: -1, numReviews: -1 };
          break;
        case 'best-selling':
          sortOption = { numReviews: -1 };
          break;
        case 'most-popular':
          sortOption = { views: -1 };
          break;
        case 'highest-discount':
          sortOption = { discountPercentage: -1 };
          break;
        case 'featured':
          sortOption = { isFeatured: -1, createdAt: -1 };
          break;
        default:
          sortOption = { createdAt: -1 }; // newest
      }
    } else {
      sortOption = { createdAt: -1 };
    }

    // Execute query with pagination
    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOption)
        .limit(limit)
        .skip(skip)
        .select('-reviews -__v'), // Exclude heavy fields
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
      },
      filters: {
        categories: await Product.distinct('category'),
        brands: await Product.distinct('brand'),
        priceRange: await Product.aggregate([
          { $match: query },
          { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }
        ])
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProductById = async (req, res) => {
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
    const products = await Product.find({ _id: { $in: productIds } })
      .select('-reviews -__v')
      .limit(10);
    
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
    if (categoryId) {
      query.category = categoryId;
    }
    
    const products = await Product.find(query)
      .sort({ rating: -1, numReviews: -1 })
      .limit(parseInt(limit, 10))
      .select('-reviews -__v');
    
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
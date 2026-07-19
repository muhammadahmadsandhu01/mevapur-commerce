const Product = require('../models/Product');
const mongoose = require('mongoose');

// @desc    Get all products with ADVANCED dynamic filtering, sorting, pagination
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const skip = (page - 1) * limit;

    const query = { isActive: true }; // Only show active products on frontend

    // 1. Text Search
    if (req.query.keyword) {
      query.$or = [
        { name: { $regex: req.query.keyword, $options: 'i' } },
        { sku: { $regex: req.query.keyword, $options: 'i' } },
        { description: { $regex: req.query.keyword, $options: 'i' } }
      ];
    }

    // 2. Category & Subcategory Filter
    if (req.query.category) {
      const categories = req.query.category.split(',');
      query.category = { $in: categories.map(id => new mongoose.Types.ObjectId(id)) };
    }
    if (req.query.subcategory) {
      const subcategories = req.query.subcategory.split(',');
      query.subcategory = { $in: subcategories.map(id => new mongoose.Types.ObjectId(id)) };
    }

    // 3. Brand Filter
    if (req.query.brand) {
      const brands = req.query.brand.split(',');
      query.brand = { $in: brands.map(id => new mongoose.Types.ObjectId(id)) };
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

    // 🌟 7. DYNAMIC ATTRIBUTE FILTERING
    if (req.query.attribute && typeof req.query.attribute === 'object') {
      query.$and = query.$and || [];
      Object.keys(req.query.attribute).forEach(key => {
        const values = Array.isArray(req.query.attribute[key]) ? req.query.attribute[key] : [req.query.attribute[key]];
        query.$and.push({
          attributes: { $elemMatch: { name: key, value: { $in: values } } }
        });
      });
    }

    // ================= AUTOCOMPLETE SEARCH =================
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
        image:
          product.image ||
          product.primaryImage ||
          '/placeholder.png',
        category: product.category,
      }));

      return res.json({
        success: true,
        data: formattedProducts,
      });
    }

    // 8. Sorting
    let sortOption = {};
    if (req.query.sortBy === 'price-asc') sortOption = { price: 1 };
    else if (req.query.sortBy === 'price-desc') sortOption = { price: -1 };
    else if (req.query.sortBy === 'rating') sortOption = { rating: -1, numReviews: -1 };
    else if (req.query.sortBy === 'best-selling') sortOption = { numReviews: -1 };
    else sortOption = { createdAt: -1 };

    // Execute query
    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOption)
        .limit(limit)
        .skip(skip)
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('brand', 'name slug logo')
        .select('-__v'),
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
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('brand', 'name slug logo');
      
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
    // Pre-validation for variants
    if (req.body.variants && req.body.variants.length > 0) {
      req.body.variants.forEach((v, index) => {
        v.isDefault = index === 0; // Ensure first variant is default
      });
    }

    const product = new Product(req.body);
    const createdProduct = await product.save();
    
    // Populate references before sending response
    await createdProduct.populate('category', 'name slug');
    await createdProduct.populate('brand', 'name slug');

    res.status(201).json({ success: true, data: createdProduct });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Product with this name or SKU already exists' });
    }
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

    // Pre-validation for variants update
    if (req.body.variants && req.body.variants.length > 0) {
      req.body.variants.forEach((v, index) => {
        v.isDefault = index === 0;
      });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    ).populate('category', 'name slug').populate('brand', 'name slug');

    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Product with this name or SKU already exists' });
    }
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
    
    // Soft delete preferred in enterprise, but hard delete is fine for now
    await product.deleteOne();
    res.json({ success: true, message: 'Product removed successfully' });
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
    
    // Validate ObjectIds
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    await Product.deleteMany({ _id: { $in: validIds } });
    
    res.json({ success: true, message: `${validIds.length} products deleted successfully` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get top products
// @route   GET /api/products/top
// @access  Public
exports.getTopProducts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const products = await Product.find({ isActive: true })
      .sort({ rating: -1, numReviews: -1 })
      .limit(limit)
      .populate('category', 'name slug')
      .populate('brand', 'name slug')
      .select('name price images rating numReviews slug');
      
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
    if (!ids) return res.json({ success: true, data: [] });
    
    const productIds = ids.split(',').filter(id => mongoose.Types.ObjectId.isValid(id));
    const products = await Product.find({ _id: { $in: productIds }, isActive: true })
      .select('name price primaryImage images slug rating')
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
    let query = { isActive: true };
    if (categoryId) query.category = categoryId;
    
    const products = await Product.find(query)
      .sort({ rating: -1, numReviews: -1 })
      .limit(parseInt(limit, 10))
      .select('name price primaryImage images slug rating')
      .populate('category', 'name slug')
      .populate('brand', 'name slug');
      
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
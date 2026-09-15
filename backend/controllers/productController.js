const mongoose = require('mongoose');
const Product = require('../models/Product');
const CategoryResolver = require('../services/category/CategoryResolver');
const ProductVisibilityPolicy = require('../services/product/ProductVisibilityPolicy');
const MarketContextResolver = require('../services/market/MarketContextResolver');
const MarketPriceBook = require('../models/MarketPriceBook');

function serializePublicVariant(v, variantPrice = null) {
  if (!v) return null;
  let price = v.price;
  let salePrice = v.salePrice;
  let marketPriceExact = null;

  if (variantPrice) {
    const exp = Number(variantPrice.currencyExponent !== undefined ? variantPrice.currencyExponent : 2);
    const divisor = 10 ** exp;
    price = Number(variantPrice.amountMinor) / divisor;
    salePrice = variantPrice.compareAtAmountMinor ? Number(variantPrice.compareAtAmountMinor) / divisor : null;
    marketPriceExact = {
      amountMinor: variantPrice.amountMinor,
      compareAtAmountMinor: variantPrice.compareAtAmountMinor || null,
      currency: variantPrice.currency,
      exponent: exp,
      priceSource: variantPrice.priceSource || 'manual'
    };
  }

  return {
    _id: v._id,
    sku: v.sku,
    attributes: v.attributes || [],
    price,
    salePrice,
    marketPriceExact,
    stock: v.stock,
    weight: v.weight,
    images: v.images || [],
    mediaAssetIds: v.mediaAssetIds || [],
    isDefault: Boolean(v.isDefault)
  };
}

function serializePublicProduct(product, marketPrice = null, variantPriceMap = null) {
  if (!product) return null;
  const p = product.toObject ? product.toObject() : product;

  let price = p.price;
  let originalPrice = p.originalPrice;
  let salePrice = p.salePrice;
  let currency = marketPrice?.currency || null;
  let marketPriceExact = null;

  if (marketPrice) {
    const exp = Number(marketPrice.currencyExponent !== undefined ? marketPrice.currencyExponent : 2);
    const divisor = 10 ** exp;
    price = Number(marketPrice.amountMinor) / divisor;
    currency = marketPrice.currency;
    if (marketPrice.compareAtAmountMinor) {
      originalPrice = Number(marketPrice.compareAtAmountMinor) / divisor;
      salePrice = price;
    } else {
      originalPrice = price;
      salePrice = null;
    }
    marketPriceExact = {
      amountMinor: marketPrice.amountMinor,
      compareAtAmountMinor: marketPrice.compareAtAmountMinor || null,
      currency: marketPrice.currency,
      exponent: exp,
      priceSource: marketPrice.priceSource || 'manual'
    };
  }

  return {
    _id: p._id,
    name: p.name,
    slug: p.slug,
    shortDescription: p.shortDescription || '',
    description: p.description || '',
    category: p.category || null,
    subcategory: p.subcategory || null,
    brand: p.brand || null,
    sku: p.sku || '',
    price,
    originalPrice,
    salePrice,
    currency,
    marketPriceExact,
    stock: p.stock,
    rating: p.rating,
    reviewCount: p.reviewCount,
    soldCount: p.soldCount,
    status: p.status,
    isActive: p.isActive,
    isFeatured: Boolean(p.isFeatured),
    isNewArrival: Boolean(p.isNewArrival),
    isBestSeller: Boolean(p.isBestSeller),
    isTrending: Boolean(p.isTrending),
    allowBackorders: Boolean(p.allowBackorders),
    tags: Array.isArray(p.tags) ? p.tags : [],
    ingredients: p.ingredients || '',
    nutritionalFacts: p.nutritionalFacts || '',
    storageInstructions: p.storageInstructions || '',
    shelfLife: p.shelfLife || '',
    countryOfOrigin: p.countryOfOrigin || '',
    weight: p.weight,
    dimensions: p.dimensions,
    shippingClass: p.shippingClass,
    freeShipping: Boolean(p.freeShipping),
    taxClass: p.taxClass,
    publishDate: p.publishDate,
    enableReviews: p.enableReviews !== false,
    allowWishlist: p.allowWishlist !== false,
    allowCompare: p.allowCompare !== false,
    allowCOD: p.allowCOD !== false,
    relatedProducts: p.relatedProducts || [],
    attributes: p.attributes || [],
    variants: Array.isArray(p.variants)
      ? p.variants.map((v) => {
        const vPrice = variantPriceMap ? variantPriceMap.get(String(v._id)) : null;
        return serializePublicVariant(v, vPrice || marketPrice);
      })
      : [],
    mediaAssetIds: p.mediaAssetIds || [],
    primaryMediaAssetId: p.primaryMediaAssetId || null,
    images: p.images || [],
    primaryImage: p.primaryImage || '',
    image: p.image || '',
    gallery: p.gallery || [],
    videoUrl: p.videoUrl || '',
    seo: p.seo || {},
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

/**
 * Batch retrieves active market price books for products in a resolved market.
 * @param {Array<mongoose.Types.ObjectId|string>} productIds
 * @param {string} marketCountry
 * @param {string} merchantScopeId
 * @returns {Promise<Map<string, Object>>}
 */
async function fetchMarketPriceMap(productIds, marketCountry, merchantScopeId = 'default') {
  if (!productIds || productIds.length === 0 || !marketCountry) {
    return new Map();
  }
  const now = new Date();
  const priceDocs = await MarketPriceBook.find({
    merchantScopeId,
    marketCountry,
    productId: { $in: productIds },
    status: 'active',
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
  }).lean();

  const priceMap = new Map();
  for (const doc of priceDocs) {
    const key = doc.scopeType === 'variant' && doc.variantId ? `${doc.productId}:${doc.variantId}` : String(doc.productId);
    if (!priceMap.has(key)) {
      priceMap.set(key, doc);
    }
  }
  return priceMap;
}

exports.serializePublicProduct = serializePublicProduct;
exports.serializePublicVariant = serializePublicVariant;

// @desc    Get all products for public storefront
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const skip = (page - 1) * limit;

    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Resolve Shopping Market Context
    const marketContext = await MarketContextResolver.resolve(req);
    const { marketCountry, merchantScopeId } = marketContext;

    // 2. Resolve Category Filters if supplied
    let requestedCategoryId = null;
    if (req.query.category) {
      requestedCategoryId = await CategoryResolver.resolveCategoryToId(req.query.category, { requireActive: true });
      if (!requestedCategoryId) {
        requestedCategoryId = new mongoose.Types.ObjectId(); // Fail-closed
      }
    }

    let requestedSubcategoryId = null;
    if (req.query.subcategory) {
      requestedSubcategoryId = await CategoryResolver.resolveCategoryToId(req.query.subcategory, { requireActive: true });
      if (!requestedSubcategoryId) {
        requestedSubcategoryId = new mongoose.Types.ObjectId(); // Fail-closed
      }
    }

    // 3. Canonical Visibility and Market Inheritance Filter
    const visibilityFilter = await ProductVisibilityPolicy.getPublicProductQueryFilter({
      categoryId: requestedCategoryId,
      subcategoryId: requestedSubcategoryId,
      marketCountry,
      merchantScopeId
    });

    const query = { ...visibilityFilter };

    // 4. Text Search (safely composed under $and so it does not overwrite visibility subcategory $or)
    if (req.query.keyword) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: escapeRegex(req.query.keyword), $options: 'i' } },
          { sku: { $regex: escapeRegex(req.query.keyword), $options: 'i' } },
          { description: { $regex: escapeRegex(req.query.keyword), $options: 'i' } }
        ]
      });
    }

    // 5. Brand Filter
    if (req.query.brand && mongoose.Types.ObjectId.isValid(req.query.brand)) {
      query.brand = new mongoose.Types.ObjectId(req.query.brand);
    }

    // 6. Price Range Filter
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
    }

    // 7. Rating Filter
    if (req.query.rating) {
      query.rating = { $gte: parseFloat(req.query.rating) };
    }

    // 8. Stock Availability
    if (req.query.inStock === 'true') query.stock = { $gt: 0 };
    else if (req.query.inStock === 'false') query.stock = { $lte: 0 };

    // 9. Dynamic Attribute Filtering
    if (req.query.attribute && typeof req.query.attribute === 'object') {
      query.$and = query.$and || [];
      Object.keys(req.query.attribute).forEach((key) => {
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

      const priceMap = await fetchMarketPriceMap(products.map((p) => p._id), marketCountry, merchantScopeId);

      const formattedProducts = products.map((product) => {
        const mp = priceMap.get(String(product._id));
        const price = mp ? (Number(mp.amountMinor) / (10 ** (mp.currencyExponent || 2))) : product.price;
        return {
          _id: product._id,
          name: product.name,
          slug: product.slug,
          price,
          currency: mp?.currency || marketContext.currency,
          image: product.image || product.primaryImage || '/placeholder.png',
          category: product.category
        };
      });

      return res.json({
        success: true,
        data: formattedProducts,
        meta: { marketCountry, currency: marketContext.currency }
      });
    }

    // 10. Sorting
    let sortOption = {};
    if (req.query.sortBy === 'price-asc') sortOption = { price: 1, _id: -1 };
    else if (req.query.sortBy === 'price-desc') sortOption = { price: -1, _id: -1 };
    else if (req.query.sortBy === 'rating') sortOption = { rating: -1, _id: -1 };
    else if (req.query.sortBy === 'newest') sortOption = { createdAt: -1, _id: -1 };
    else if (req.query.sortBy === 'popular') sortOption = { soldCount: -1, _id: -1 };
    else sortOption = { createdAt: -1, _id: -1 };

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name slug isActive parentId')
        .populate('subcategory', 'name slug isActive parentId')
        .populate('brand', 'name')
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query)
    ]);

    const priceMap = await fetchMarketPriceMap(products.map((p) => p._id), marketCountry, merchantScopeId);

    const serializedProducts = products.map((product) => {
      const mp = priceMap.get(String(product._id));
      return serializePublicProduct(product, mp);
    });

    const pages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: serializedProducts,
      pagination: {
        page,
        limit,
        total,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1
      },
      meta: {
        marketCountry,
        currency: marketContext.currency
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// @desc    Get single published product by ID or Slug
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    // 1. Resolve Shopping Market Context
    const marketContext = await MarketContextResolver.resolve(req);
    const { marketCountry, merchantScopeId } = marketContext;

    let product = null;
    if (isValidObjectId) {
      product = await Product.findOne({ _id: id, isActive: true, status: 'published' }).lean();
    }

    if (!product) {
      product = await Product.findOne({ slug: id, isActive: true, status: 'published' }).lean();
    }

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // 2. Assert Category and Market Eligibility (Fail closed with truthful 404)
    const isEligible = await ProductVisibilityPolicy.isProductPubliclyEligible(product, {
      marketCountry,
      merchantScopeId
    });

    if (!isEligible) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // 3. Fetch exact market pricing (product-level and variant overrides)
    const now = new Date();
    const priceDocs = await MarketPriceBook.find({
      merchantScopeId,
      productId: product._id,
      marketCountry,
      status: 'active',
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
    }).lean();

    let productPrice = null;
    const variantPriceMap = new Map();
    for (const doc of priceDocs) {
      if (doc.scopeType === 'variant' && doc.variantId) {
        variantPriceMap.set(String(doc.variantId), doc);
      } else {
        productPrice = doc;
      }
    }

    await Product.populate(product, [
      { path: 'category', select: 'name slug isActive parentId' },
      { path: 'subcategory', select: 'name slug isActive parentId' },
      { path: 'brand', select: 'name' }
    ]);

    res.json({
      success: true,
      data: serializePublicProduct(product, productPrice, variantPriceMap),
      meta: {
        marketCountry,
        currency: productPrice?.currency || priceDocs[0]?.currency || marketContext.currency
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: 'Failed to fetch product details' });
  }
};

// @desc    Get top rated published products
// @route   GET /api/products/top
// @access  Public
exports.getTopProducts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    const marketContext = await MarketContextResolver.resolve(req);
    const { marketCountry, merchantScopeId } = marketContext;

    const visibilityFilter = await ProductVisibilityPolicy.getPublicProductQueryFilter({
      marketCountry,
      merchantScopeId
    });

    const products = await Product.find(visibilityFilter)
      .sort({ rating: -1, reviewCount: -1, _id: -1 })
      .limit(limit)
      .populate('category', 'name slug')
      .lean();

    const priceMap = await fetchMarketPriceMap(products.map((p) => p._id), marketCountry, merchantScopeId);

    res.json({
      success: true,
      data: products.map((p) => serializePublicProduct(p, priceMap.get(String(p._id)))),
      meta: { marketCountry, currency: marketContext.currency }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// @desc    Get recommended products
// @route   GET /api/products/recommended
// @access  Public
exports.getRecommendedProducts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
    const marketContext = await MarketContextResolver.resolve(req);
    const { marketCountry, merchantScopeId } = marketContext;

    const visibilityFilter = await ProductVisibilityPolicy.getPublicProductQueryFilter({
      marketCountry,
      merchantScopeId
    });

    const products = await Product.find(visibilityFilter)
      .sort({ isFeatured: -1, rating: -1, soldCount: -1, _id: -1 })
      .limit(limit)
      .populate('category', 'name slug')
      .lean();

    const priceMap = await fetchMarketPriceMap(products.map((p) => p._id), marketCountry, merchantScopeId);

    res.json({
      success: true,
      data: products.map((p) => serializePublicProduct(p, priceMap.get(String(p._id)))),
      meta: { marketCountry, currency: marketContext.currency }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
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

    const productIds = ids.split(',').filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (productIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const marketContext = await MarketContextResolver.resolve(req);
    const { marketCountry, merchantScopeId } = marketContext;

    const visibilityFilter = await ProductVisibilityPolicy.getPublicProductQueryFilter({
      marketCountry,
      merchantScopeId
    });

    const products = await Product.find({
      ...visibilityFilter,
      _id: { $in: productIds }
    })
      .populate('category', 'name slug')
      .lean();

    const priceMap = await fetchMarketPriceMap(products.map((p) => p._id), marketCountry, merchantScopeId);

    res.json({
      success: true,
      data: products.map((p) => serializePublicProduct(p, priceMap.get(String(p._id)))),
      meta: { marketCountry, currency: marketContext.currency }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

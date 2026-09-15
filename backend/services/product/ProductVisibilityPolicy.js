/**
 * @file ProductVisibilityPolicy.js
 * @description Canonical, centralized product visibility and eligibility enforcement policy.
 *
 * Rules:
 * 1. A product is publicly visible/purchasable if and only if:
 *    - Product is active (`isActive === true`);
 *    - Product is published (`status === 'published'`);
 *    - Primary category exists, is active, and all its ancestors are active;
 *    - Optional subcategory (if assigned) exists, is active, and all its ancestors are active;
 *    - Active ProductMarketOffering exists for the requested market and effective at query time;
 *    - Active MarketPriceBook entry exists for the requested market and effective at query time.
 * 2. Unassigned, deleted, inactive, orphaned, or cyclic categories fail closed.
 * 3. Administrative, inventory, ledger, refund, and historical order consumers explicitly bypass this policy.
 * 4. Strict deny-by-default for unconfigured markets. Gated legacy home-market fallback is only enabled
 *    under explicit operator authorization (ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY).
 */

const mongoose = require('mongoose');
const Category = require('../../models/Category');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const MarketService = require('../MarketService');
const { getRuntimeConfig } = require('../../config/runtime.config');

const MAX_CATEGORY_HIERARCHY_DEPTH = 20;

/**
 * Named Compatibility Gate for legacy unconfigured product offerings.
 * Strictly defaults to false in staging/production.
 * Removal boundary: Phase 7 / Legacy Deprecation.
 */
function isLegacyHomeMarketOfferingCompatibilityEnabled() {
  if (process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY === 'true') {
    return true;
  }
  try {
    const config = getRuntimeConfig();
    return Boolean(config?.commerce?.allowLegacyHomeMarketOfferingCompatibility);
  } catch {
    return false;
  }
}

class ProductVisibilityPolicy {
  isLegacyHomeMarketOfferingCompatibilityEnabled() {
    return isLegacyHomeMarketOfferingCompatibilityEnabled();
  }

  static isLegacyHomeMarketOfferingCompatibilityEnabled() {
    return isLegacyHomeMarketOfferingCompatibilityEnabled();
  }

  /**
   * Resolve all category ObjectIds that are active and whose entire ancestor chain is active.
   * Uses exactly 1 bounded MongoDB query and in-memory ancestor validation.
   *
   * @param {object} [options={}]
   * @param {mongoose.ClientSession|null} [options.session=null]
   * @returns {Promise<mongoose.Types.ObjectId[]>} Array of fully active Category ObjectIds.
   */
  async getActiveCategoryIds({ session = null } = {}) {
    let query = Category.find({ isActive: true }, '_id parentId parentCategory isActive').lean();
    if (session) {
      query = query.session(session);
    }
    const activeCategories = await query;

    if (!activeCategories || activeCategories.length === 0) {
      return [];
    }

    const categoryMap = new Map();
    for (const cat of activeCategories) {
      categoryMap.set(String(cat._id), cat);
    }

    const fullyActiveIds = [];

    for (const cat of activeCategories) {
      let current = cat;
      let isValid = true;
      let depth = 0;
      const visited = new Set([String(current._id)]);

      while (current && (current.parentId || current.parentCategory)) {
        depth += 1;
        if (depth > MAX_CATEGORY_HIERARCHY_DEPTH) {
          isValid = false;
          break;
        }

        const parentIdStr = String(current.parentId || current.parentCategory);
        if (visited.has(parentIdStr)) {
          isValid = false;
          break;
        }
        visited.add(parentIdStr);

        const parent = categoryMap.get(parentIdStr);
        if (!parent || parent.isActive !== true) {
          isValid = false;
          break;
        }

        current = parent;
      }

      if (isValid) {
        fullyActiveIds.push(cat._id);
      }
    }

    return fullyActiveIds;
  }

  /**
   * Resolves eligible Product ObjectIds for a given market.
   * Requires:
   * 1. Active ProductMarketOffering (status='active', visibility='visible', effective date valid)
   * 2. Active MarketPriceBook entry (status='active', effective date valid)
   *
   * @param {object} options
   * @param {string} options.marketCountry - Normalized ISO 3166-1 alpha-2 country code
   * @param {string} [options.merchantScopeId='default']
   * @param {Date} [options.atDate=new Date()]
   * @param {mongoose.ClientSession|null} [options.session=null]
   * @returns {Promise<mongoose.Types.ObjectId[]>}
   */
  async getEligibleProductIdsForMarket({
    marketCountry,
    merchantScopeId = 'default',
    atDate = new Date(),
    session = null
  } = {}) {
    if (!marketCountry || typeof marketCountry !== 'string') {
      return [];
    }

    const country = marketCountry.trim().toUpperCase();
    const now = new Date(atDate);

    // 1. Query active offerings for this market
    let offeringQuery = ProductMarketOffering.find({
      merchantScopeId,
      marketCountry: country,
      status: 'active',
      visibility: 'visible',
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
    }, 'productId').lean();

    if (session) {
      offeringQuery = offeringQuery.session(session);
    }

    const offerings = await offeringQuery;
    const offeringProductIds = (offerings || []).map((o) => String(o.productId));

    // 2. Query active price books for this market matching offering product IDs
    let eligibleProductIds = [];
    if (offeringProductIds.length > 0) {
      let priceQuery = MarketPriceBook.find({
        merchantScopeId,
        marketCountry: country,
        status: 'active',
        productId: { $in: offeringProductIds },
        effectiveFrom: { $lte: now },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
      }, 'productId').lean();

      if (session) {
        priceQuery = priceQuery.session(session);
      }

      const priceBooks = await priceQuery;
      if (priceBooks && priceBooks.length > 0) {
        eligibleProductIds = Array.from(new Set(priceBooks.map((p) => String(p.productId))))
          .map((id) => new mongoose.Types.ObjectId(id));
      }
    }

    // 3. Optional Gated Legacy Home-Market Fallback (Strictly disabled by default)
    if (isLegacyHomeMarketOfferingCompatibilityEnabled()) {
      try {
        const config = await MarketService.getConfig({ merchantScopeId });
        const homeCountry = (config.merchantCountry || config.homeCountry || '').toUpperCase();

        if (country === homeCountry) {
          const allProductIdsWithOfferings = await ProductMarketOffering.distinct('productId', { merchantScopeId });
          const ProductModel = mongoose.models.Product || mongoose.model('Product');
          let legacyQuery = ProductModel.find({
            _id: { $nin: allProductIdsWithOfferings }
          }, '_id').lean();
          if (session) legacyQuery = legacyQuery.session(session);
          const legacyProducts = await legacyQuery;
          const legacyIds = legacyProducts.map((p) => p._id);
          eligibleProductIds = eligibleProductIds.concat(legacyIds);
        }
      } catch {
        // Fail closed if config unavailable
      }
    }

    return eligibleProductIds;
  }

  /**
   * Check if a product has active market offering and active market price.
   *
   * @param {object|mongoose.Types.ObjectId|string} productOrId
   * @param {object} options
   * @param {string} options.marketCountry
   * @param {mongoose.Types.ObjectId|string|null} [options.variantId=null]
   * @param {string} [options.merchantScopeId='default']
   * @param {Date} [options.atDate=new Date()]
   * @param {mongoose.ClientSession|null} [options.session=null]
   * @returns {Promise<boolean>}
   */
  async isProductMarketEligible(productOrId, {
    marketCountry,
    variantId = null,
    merchantScopeId = 'default',
    atDate = new Date(),
    session = null
  } = {}) {
    if (!productOrId || !marketCountry) {
      return false;
    }

    const productId = productOrId._id || productOrId;
    const country = marketCountry.trim().toUpperCase();
    const now = new Date(atDate);

    // 1. Check for variant-specific offering first if variantId provided
    if (variantId) {
      const variantIdStr = String(variantId);
      let variantOfferingQuery = ProductMarketOffering.findOne({
        merchantScopeId,
        productId,
        scopeType: 'variant',
        scopeKey: variantIdStr,
        marketCountry: country,
        status: 'active',
        visibility: 'visible',
        effectiveFrom: { $lte: now },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
      }).lean();

      if (session) variantOfferingQuery = variantOfferingQuery.session(session);
      const variantOffering = await variantOfferingQuery;

      if (variantOffering) {
        let variantPriceQuery = MarketPriceBook.findOne({
          merchantScopeId,
          productId,
          scopeType: 'variant',
          scopeKey: variantIdStr,
          marketCountry: country,
          status: 'active',
          effectiveFrom: { $lte: now },
          $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
        }).lean();

        if (session) variantPriceQuery = variantPriceQuery.session(session);
        const variantPrice = await variantPriceQuery;
        if (variantPrice) return true;

        if (variantOffering.pricingPolicy === 'variant_override_required') {
          return false;
        }
      }
    }

    // 2. Check product-level offering
    let offeringQuery = ProductMarketOffering.findOne({
      merchantScopeId,
      productId,
      scopeType: 'product',
      marketCountry: country,
      status: 'active',
      visibility: 'visible',
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
    }).lean();

    if (session) offeringQuery = offeringQuery.session(session);
    const offering = await offeringQuery;

    if (offering) {
      let priceQuery = MarketPriceBook.findOne({
        merchantScopeId,
        productId,
        scopeType: 'product',
        marketCountry: country,
        status: 'active',
        effectiveFrom: { $lte: now },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
      }).lean();

      if (session) priceQuery = priceQuery.session(session);
      const price = await priceQuery;
      return Boolean(price);
    }

    // 3. Optional Gated Legacy Home-Market Fallback (Strictly disabled by default)
    if (isLegacyHomeMarketOfferingCompatibilityEnabled()) {
      try {
        const config = await MarketService.getConfig({ merchantScopeId });
        const homeCountry = (config.merchantCountry || config.homeCountry || '').toUpperCase();

        if (country === homeCountry) {
          const hasAnyOffering = await ProductMarketOffering.exists({ merchantScopeId, productId });
          if (!hasAnyOffering) {
            return true;
          }
        }
      } catch {
        // Fail closed
      }
    }

    return false;
  }

  /**
   * Build canonical MongoDB query filter for public product discovery.
   *
   * @param {object} [options={}]
   * @param {mongoose.ClientSession|null} [options.session=null]
   * @param {mongoose.Types.ObjectId[]|null} [options.activeCategoryIds=null]
   * @param {mongoose.Types.ObjectId|string|null} [options.categoryId=null]
   * @param {mongoose.Types.ObjectId|string|null} [options.subcategoryId=null]
   * @param {string|null} [options.marketCountry=null]
   * @param {string} [options.merchantScopeId='default']
   * @param {Date} [options.atDate=new Date()]
   * @returns {Promise<object>} MongoDB filter object.
   */
  async getPublicProductQueryFilter({
    session = null,
    activeCategoryIds = null,
    categoryId = null,
    subcategoryId = null,
    marketCountry = null,
    merchantScopeId = 'default',
    atDate = new Date()
  } = {}) {
    const activeIds = activeCategoryIds || await this.getActiveCategoryIds({ session });

    if (!activeIds || activeIds.length === 0) {
      return {
        isActive: true,
        status: 'published',
        category: { $in: [] }
      };
    }

    const activeSet = new Set(activeIds.map((id) => String(id)));

    const filter = {
      isActive: true,
      status: 'published',
      $or: [
        { subcategory: null },
        { subcategory: { $exists: false } },
        { subcategory: { $in: activeIds } }
      ]
    };

    if (categoryId) {
      const catIdStr = String(categoryId);
      if (activeSet.has(catIdStr)) {
        filter.category = mongoose.Types.ObjectId.isValid(categoryId)
          ? new mongoose.Types.ObjectId(catIdStr)
          : categoryId;
      } else {
        filter.category = new mongoose.Types.ObjectId();
      }
    } else {
      filter.category = { $in: activeIds };
    }

    if (subcategoryId) {
      const subIdStr = String(subcategoryId);
      if (activeSet.has(subIdStr)) {
        filter.subcategory = mongoose.Types.ObjectId.isValid(subcategoryId)
          ? new mongoose.Types.ObjectId(subIdStr)
          : subcategoryId;
      } else {
        filter.subcategory = new mongoose.Types.ObjectId();
      }
    }

    if (marketCountry) {
      const eligibleProductIds = await this.getEligibleProductIdsForMarket({
        marketCountry,
        merchantScopeId,
        atDate,
        session
      });
      filter._id = { $in: eligibleProductIds };
    }

    return filter;
  }

  /**
   * Verify if a single product has active category/subcategory inheritance.
   *
   * @param {object} product - Mongoose Document or plain JS object.
   * @param {object} [options={}]
   * @param {mongoose.ClientSession|null} [options.session=null]
   * @param {mongoose.Types.ObjectId[]|Set<string>|null} [options.activeCategoryIds=null]
   * @returns {Promise<boolean>}
   */
  async isProductCategoryEligible(product, { session = null, activeCategoryIds = null } = {}) {
    if (!product || !product.category) {
      return false;
    }

    let activeSet;
    if (activeCategoryIds instanceof Set) {
      activeSet = activeCategoryIds;
    } else if (Array.isArray(activeCategoryIds)) {
      activeSet = new Set(activeCategoryIds.map((id) => String(id)));
    } else {
      const fetchedIds = await this.getActiveCategoryIds({ session });
      activeSet = new Set(fetchedIds.map((id) => String(id)));
    }

    if (activeSet.size === 0) {
      return false;
    }

    const primaryCatId = product.category?._id
      ? String(product.category._id)
      : String(product.category);

    if (!activeSet.has(primaryCatId)) {
      return false;
    }

    if (product.subcategory) {
      const subCatId = product.subcategory?._id
        ? String(product.subcategory._id)
        : String(product.subcategory);

      if (!activeSet.has(subCatId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Determine full public eligibility (lifecycle + category inheritance + optional market eligibility).
   *
   * @param {object} product
   * @param {object} [options={}]
   * @returns {Promise<boolean>}
   */
  async isProductPubliclyEligible(product, options = {}) {
    if (!product) return false;
    if (product.isActive !== true || product.status !== 'published') {
      return false;
    }
    const isCategoryEligible = await this.isProductCategoryEligible(product, options);
    if (!isCategoryEligible) {
      return false;
    }

    if (options.marketCountry) {
      return await this.isProductMarketEligible(product, options);
    }

    return true;
  }

  /**
   * Returns count of legacy products lacking any market offerings.
   * @param {object} [options]
   * @param {string} [options.merchantScopeId='default']
   * @returns {Promise<number>}
   */
  async getUnmigratedProductsCount({ merchantScopeId = 'default' } = {}) {
    const allProductIdsWithOfferings = await ProductMarketOffering.distinct('productId', { merchantScopeId });
    const ProductModel = mongoose.models.Product || mongoose.model('Product');
    return ProductModel.countDocuments({ _id: { $nin: allProductIdsWithOfferings } });
  }
}

module.exports = new ProductVisibilityPolicy();
module.exports.ProductVisibilityPolicy = ProductVisibilityPolicy;

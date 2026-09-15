/**
 * @file InventoryAvailabilityService.js
 * @description Public ATP evaluation and truth-based availability classification for Phase 6D-2.
 * Connects product market offerings, authorized fulfillment locations, and aggregate location ATP
 * into truthful statuses: in_stock, low_stock, out_of_stock, backorder, unavailable_in_market.
 */

const mongoose = require('mongoose');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const Product = require('../../models/Product');

class InventoryAvailabilityService {
  /**
   * Determine authoritative availability classification for a product or variant in a target market.
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId} params.productId
   * @param {string|mongoose.Types.ObjectId} [params.variantId=null]
   * @param {string} params.marketCountry - ISO 3166-1 alpha-2 destination country
   * @param {string} [params.merchantScopeId='default']
   * @returns {Promise<Object>}
   */
  async getAvailability({
    productId,
    variantId = null,
    marketCountry,
    merchantScopeId = 'default'
  }) {
    if (!productId || !marketCountry) {
      return {
        status: 'unavailable_in_market',
        isPurchasable: false,
        atp: 0,
        allowBackorder: false
      };
    }

    const normCountry = String(marketCountry).trim().toUpperCase();
    const now = new Date();

    // 1. Check Market Offering Governance
    const offeringQuery = {
      merchantScopeId,
      productId,
      marketCountry: normCountry,
      status: 'active',
      visibility: 'visible',
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
    };

    if (variantId) {
      offeringQuery.scopeType = 'variant';
      offeringQuery.scopeKey = String(variantId);
    } else {
      offeringQuery.scopeType = 'product';
    }

    let offering = await ProductMarketOffering.findOne(offeringQuery);
    // If variant offering not found, check product-level offering
    if (!offering && variantId) {
      offering = await ProductMarketOffering.findOne({
        merchantScopeId,
        productId,
        scopeType: 'product',
        marketCountry: normCountry,
        status: 'active',
        visibility: 'visible',
        effectiveFrom: { $lte: now },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
      });
    }

    if (!offering) {
      return {
        status: 'unavailable_in_market',
        isPurchasable: false,
        atp: 0,
        allowBackorder: false
      };
    }

    // 2. Find active fulfillment locations authorized to serve target market country
    const activeLocations = await FulfillmentLocation.find({
      merchantScopeId,
      status: 'active',
      supportedMarketCountries: normCountry,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
    });

    if (activeLocations.length === 0) {
      return {
        status: 'unavailable_in_market',
        isPurchasable: false,
        atp: 0,
        allowBackorder: false,
        servingLocationsCount: 0
      };
    }

    const locationIds = activeLocations.map((loc) => loc._id);
    const scopeKey = variantId ? String(variantId) : 'product';

    // 3. Find inventory positions across authorized locations
    let positions = await InventoryPosition.find({
      merchantScopeId,
      productId,
      scopeKey,
      locationId: { $in: locationIds }
    });

    let totalAtp = 0;
    let allowBackorder = false;

    positions.forEach((pos) => {
      totalAtp += pos.calculateATP();
      if (pos.allowBackorder) allowBackorder = true;
    });

    // Determine low stock threshold from product
    const product = await Product.findById(productId, 'lowStockThreshold');
    const threshold = typeof product?.lowStockThreshold === 'number' ? product.lowStockThreshold : 10;

    let status = 'out_of_stock';
    let isPurchasable = false;

    if (totalAtp >= threshold) {
      status = 'in_stock';
      isPurchasable = true;
    } else if (totalAtp > 0) {
      status = 'low_stock';
      isPurchasable = true;
    } else if (allowBackorder) {
      status = 'backorder';
      isPurchasable = true;
    } else {
      status = 'out_of_stock';
      isPurchasable = false;
    }

    return {
      status,
      isPurchasable,
      atp: totalAtp,
      allowBackorder,
      servingLocationsCount: activeLocations.length
    };
  }

  /**
   * Batch evaluate availability for multiple products in a target market.
   * @param {Object} params
   * @param {Array<string|mongoose.Types.ObjectId>} params.productIds
   * @param {string} params.marketCountry
   * @param {string} [params.merchantScopeId='default']
   * @returns {Promise<Map<string, Object>>}
   */
  async getBatchAvailability({ productIds, marketCountry, merchantScopeId = 'default' }) {
    const map = new Map();
    if (!Array.isArray(productIds) || productIds.length === 0 || !marketCountry) {
      return map;
    }

    const normCountry = String(marketCountry).trim().toUpperCase();
    const now = new Date();

    const activeLocations = await FulfillmentLocation.find({
      merchantScopeId,
      status: 'active',
      supportedMarketCountries: normCountry,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
    }).select('_id isDefault locationCode');

    if (activeLocations.length === 0) {
      productIds.forEach((pid) => {
        map.set(String(pid), {
          status: 'unavailable_in_market',
          isPurchasable: false,
          atp: 0,
          allowBackorder: false,
          servingLocationsCount: 0
        });
      });
      return map;
    }

    const locationIds = activeLocations.map((loc) => loc._id);

    const positions = await InventoryPosition.find({
      merchantScopeId,
      productId: { $in: productIds },
      locationId: { $in: locationIds }
    });

    const positionsByProduct = new Map();
    positions.forEach((pos) => {
      const pid = String(pos.productId);
      if (!positionsByProduct.has(pid)) positionsByProduct.set(pid, []);
      positionsByProduct.get(pid).push(pos);
    });

    for (const pid of productIds) {
      const pidStr = String(pid);
      const posList = positionsByProduct.get(pidStr) || [];
      let totalAtp = 0;
      let allowBackorder = false;

      posList.forEach((pos) => {
        totalAtp += pos.calculateATP();
        if (pos.allowBackorder) allowBackorder = true;
      });

      let status = 'out_of_stock';
      let isPurchasable = false;

      if (totalAtp >= 10) {
        status = 'in_stock';
        isPurchasable = true;
      } else if (totalAtp > 0) {
        status = 'low_stock';
        isPurchasable = true;
      } else if (allowBackorder) {
        status = 'backorder';
        isPurchasable = true;
      } else {
        status = 'out_of_stock';
        isPurchasable = false;
      }

      map.set(pidStr, {
        status,
        isPurchasable,
        atp: totalAtp,
        allowBackorder,
        servingLocationsCount: activeLocations.length
      });
    }

    return map;
  }
}

module.exports = new InventoryAvailabilityService();

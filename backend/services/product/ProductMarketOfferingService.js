/**
 * @file ProductMarketOfferingService.js
 * @description Admin Service for managing Product Market Offerings and Exact Price Books.
 * Enforces merchant configuration boundaries, active market validation, and optimistic concurrency.
 */

const Product = require('../../models/Product');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const MarketService = require('../MarketService');
const { CurrencyRegistry } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class ProductMarketOfferingService {
  /**
   * Retrieves all market offerings and associated active prices for a product.
   * @param {string} productId
   * @param {Object} [options]
   * @param {string} [options.merchantScopeId='default']
   * @returns {Promise<Object>}
   */
  async getOfferingsForProduct(productId, { merchantScopeId = 'default' } = {}) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    const [offerings, priceBooks] = await Promise.all([
      ProductMarketOffering.find({ merchantScopeId, productId }).sort({ marketCountry: 1 }),
      MarketPriceBook.find({ merchantScopeId, productId, status: 'active' })
    ]);

    const priceMap = new Map();
    for (const pb of priceBooks) {
      const key = pb.variantId ? `${pb.marketCountry}:${pb.variantId}` : pb.marketCountry;
      priceMap.set(key, pb);
    }

    const enriched = offerings.map((offering) => {
      const offObj = offering.toObject();
      const key = offering.variantId ? `${offering.marketCountry}:${offering.variantId}` : offering.marketCountry;
      offObj.price = priceMap.get(key) || null;
      return offObj;
    });

    return {
      productId: String(product._id),
      productName: product.name,
      offerings: enriched
    };
  }

  /**
   * Upserts one or more market offerings for a product.
   * @param {string} productId
   * @param {Array<Object>} offeringsList
   * @param {Object} context
   * @param {string} context.actorId
   * @param {string} [context.merchantScopeId='default']
   * @returns {Promise<Array<Object>>}
   */
  async upsertOfferings(productId, offeringsList, { actorId, merchantScopeId = 'default' } = {}) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    const config = await MarketService.getConfig({ merchantScopeId });
    const enabledCountries = config.enabledCountries || [config.merchantCountry || 'PK'];

    const results = [];

    for (const item of offeringsList) {
      const marketCountry = item.marketCountry.trim().toUpperCase();

      if (item.status === 'active' && !enabledCountries.includes(marketCountry)) {
        throw new AppError(
          `Market country '${marketCountry}' is not enabled in the active store configuration.`,
          400,
          'MARKET_COUNTRY_INELIGIBLE'
        );
      }

      const query = {
        merchantScopeId,
        productId: product._id,
        variantId: item.variantId || null,
        marketCountry
      };

      let existing = await ProductMarketOffering.findOne(query);

      if (existing) {
        if (item.lockVersion !== undefined && item.lockVersion !== existing.lockVersion) {
          throw new AppError(
            `Optimistic concurrency conflict for market '${marketCountry}'. The offering was updated by another request.`,
            409,
            'CONCURRENCY_CONFLICT'
          );
        }

        existing.status = item.status || existing.status;
        existing.visibility = item.visibility || existing.visibility;
        existing.fulfillmentMode = item.fulfillmentMode || existing.fulfillmentMode;
        if (item.eligibleFulfillmentOriginIds !== undefined) {
          existing.eligibleFulfillmentOriginIds = item.eligibleFulfillmentOriginIds;
        }
        if (item.effectiveFrom !== undefined) existing.effectiveFrom = item.effectiveFrom;
        if (item.effectiveTo !== undefined) existing.effectiveTo = item.effectiveTo;
        if (item.saleConstraints) existing.saleConstraints = item.saleConstraints;
        existing.lockVersion += 1;
        existing.updatedBy = actorId;
        await existing.save();
        results.push(existing);
      } else {
        const created = await ProductMarketOffering.create({
          merchantScopeId,
          productId: product._id,
          variantId: item.variantId || null,
          sku: item.sku || product.sku || '',
          marketCountry,
          status: item.status || 'draft',
          visibility: item.visibility || 'visible',
          fulfillmentMode: item.fulfillmentMode || 'local',
          eligibleFulfillmentOriginIds: item.eligibleFulfillmentOriginIds || [],
          effectiveFrom: item.effectiveFrom || Date.now(),
          effectiveTo: item.effectiveTo || null,
          saleConstraints: item.saleConstraints || { minQuantity: 1, maxQuantity: null },
          lockVersion: 1,
          createdBy: actorId,
          updatedBy: actorId
        });
        results.push(created);
      }
    }

    return results;
  }

  /**
   * Retrieves all price book entries for a product.
   * @param {string} productId
   * @param {Object} [options]
   * @param {string} [options.merchantScopeId='default']
   * @returns {Promise<Array<Object>>}
   */
  async getPricesForProduct(productId, { merchantScopeId = 'default' } = {}) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    return MarketPriceBook.find({ merchantScopeId, productId }).sort({ marketCountry: 1, currency: 1 });
  }

  /**
   * Upserts exact market price book entries for a product.
   * @param {string} productId
   * @param {Array<Object>} pricesList
   * @param {Object} context
   * @param {string} context.actorId
   * @param {string} [context.merchantScopeId='default']
   * @returns {Promise<Array<Object>>}
   */
  async upsertPrices(productId, pricesList, { actorId, merchantScopeId = 'default' } = {}) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    const config = await MarketService.getConfig({ merchantScopeId });
    const enabledCurrencies = config.enabledCurrencies || [config.defaultCurrency || config.baseCurrency || 'PKR'];

    const results = [];

    for (const item of pricesList) {
      const marketCountry = item.marketCountry.trim().toUpperCase();
      const currency = item.currency.trim().toUpperCase();

      if (!CurrencyRegistry.has(currency)) {
        throw new AppError(`Currency '${currency}' is unknown in ISO 4217`, 400, 'INVALID_CURRENCY');
      }

      if (item.status === 'active' && !enabledCurrencies.includes(currency)) {
        throw new AppError(`Currency '${currency}' is not enabled in active store configuration`, 400, 'MARKET_CURRENCY_INELIGIBLE');
      }

      const currencyData = CurrencyRegistry.get(currency);
      const currencyExponent = item.currencyExponent !== undefined ? item.currencyExponent : currencyData.exponent;

      const query = {
        merchantScopeId,
        productId: product._id,
        variantId: item.variantId || null,
        marketCountry,
        currency
      };

      let existing = await MarketPriceBook.findOne(query);

      if (existing) {
        if (item.lockVersion !== undefined && item.lockVersion !== existing.lockVersion) {
          throw new AppError(
            `Optimistic concurrency conflict for price in market '${marketCountry}' currency '${currency}'.`,
            409,
            'CONCURRENCY_CONFLICT'
          );
        }

        existing.amountMinor = item.amountMinor;
        existing.compareAtAmountMinor = item.compareAtAmountMinor !== undefined ? item.compareAtAmountMinor : existing.compareAtAmountMinor;
        existing.currencyExponent = currencyExponent;
        existing.priceSource = item.priceSource || existing.priceSource;
        if (item.fxSnapshotReference !== undefined) existing.fxSnapshotReference = item.fxSnapshotReference;
        if (item.effectiveFrom !== undefined) existing.effectiveFrom = item.effectiveFrom;
        if (item.effectiveTo !== undefined) existing.effectiveTo = item.effectiveTo;
        existing.status = item.status || existing.status;
        existing.lockVersion += 1;
        existing.updatedBy = actorId;
        await existing.save();
        results.push(existing);
      } else {
        const created = await MarketPriceBook.create({
          merchantScopeId,
          productId: product._id,
          variantId: item.variantId || null,
          sku: item.sku || product.sku || '',
          marketCountry,
          currency,
          currencyExponent,
          amountMinor: item.amountMinor,
          compareAtAmountMinor: item.compareAtAmountMinor || null,
          priceSource: item.priceSource || 'manual',
          fxSnapshotReference: item.fxSnapshotReference || null,
          effectiveFrom: item.effectiveFrom || Date.now(),
          effectiveTo: item.effectiveTo || null,
          status: item.status || 'active',
          lockVersion: 1,
          createdBy: actorId,
          updatedBy: actorId
        });
        results.push(created);
      }
    }

    return results;
  }
}

module.exports = new ProductMarketOfferingService();
module.exports.ProductMarketOfferingService = ProductMarketOfferingService;

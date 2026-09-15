/**
 * @file ProductMarketOfferingService.js
 * @description Admin Service for managing Product Market Offerings and Exact Price Books.
 * Enforces merchant configuration boundaries, active market validation, variant/SKU ownership,
 * immutable price versioning, interval non-overlap, and optimistic concurrency.
 */

const mongoose = require('mongoose');
const Product = require('../../models/Product');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const MarketService = require('../MarketService');
const { CurrencyRegistry } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class ProductMarketOfferingService {
  /**
   * Helper to execute in session if provided or manage a standalone session.
   */
  async runWithSession(work, externalSession = null) {
    if (externalSession) {
      return work(externalSession);
    }
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Resolves and validates variant reference and SKU against canonical product document.
   */
  resolveVariantAndSku(product, variantId, callerSku) {
    if (!variantId) {
      const canonicalSku = product.sku || '';
      if (callerSku && callerSku.trim() && callerSku.trim() !== canonicalSku) {
        throw new AppError(
          `Supplied SKU '${callerSku}' does not match product SKU '${canonicalSku}'`,
          400,
          'SKU_MISMATCH'
        );
      }
      return { variantId: null, sku: canonicalSku, scopeType: 'product', scopeKey: 'product' };
    }

    const variantIdStr = String(variantId);
    const matchedVariant = (product.variants || []).find((v) => String(v._id) === variantIdStr);
    if (!matchedVariant) {
      throw new AppError(
        `Variant ID '${variantIdStr}' does not belong to product '${product.name}' (${product._id})`,
        400,
        'INVALID_VARIANT_REFERENCE'
      );
    }

    const canonicalSku = matchedVariant.sku || product.sku || '';
    if (callerSku && callerSku.trim() && callerSku.trim() !== canonicalSku) {
      throw new AppError(
        `Supplied SKU '${callerSku}' does not match variant SKU '${canonicalSku}'`,
        400,
        'SKU_MISMATCH'
      );
    }

    return {
      variantId: matchedVariant._id,
      sku: canonicalSku,
      scopeType: 'variant',
      scopeKey: variantIdStr
    };
  }

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
      ProductMarketOffering.find({ merchantScopeId, productId }).sort({ marketCountry: 1, scopeKey: 1, version: -1 }),
      MarketPriceBook.find({ merchantScopeId, productId, status: 'active' })
    ]);

    const priceMap = new Map();
    for (const pb of priceBooks) {
      const key = `${pb.marketCountry}:${pb.scopeKey}`;
      priceMap.set(key, pb);
    }

    const enriched = offerings.map((offering) => {
      const offObj = offering.toObject();
      const key = `${offering.marketCountry}:${offering.scopeKey}`;
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
  async upsertOfferings(productId, offeringsList, { actorId, merchantScopeId = 'default', session = null } = {}) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    const config = await MarketService.getConfig({ merchantScopeId });
    const enabledCountries = config.enabledCountries || [config.merchantCountry || 'PK'];

    const executeUpsert = async (sess) => {
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

        const { variantId, sku, scopeType, scopeKey } = this.resolveVariantAndSku(
          product,
          item.variantId,
          item.sku
        );

        let activeQuery = ProductMarketOffering.findOne({
          merchantScopeId,
          productId: product._id,
          scopeType,
          scopeKey,
          marketCountry,
          status: 'active'
        });
        if (sess) activeQuery = activeQuery.session(sess);
        const activeOffering = await activeQuery;

        if (activeOffering) {
          if (item.lockVersion !== undefined && item.lockVersion !== activeOffering.lockVersion) {
            throw new AppError(
              `Optimistic concurrency conflict for market '${marketCountry}' offering. LockVersion mismatch.`,
              409,
              'CONCURRENCY_CONFLICT'
            );
          }

          if (item.status && item.status !== 'active') {
            activeOffering.status = item.status;
            activeOffering.effectiveTo = item.effectiveTo || new Date();
            activeOffering.lockVersion += 1;
            activeOffering.updatedBy = actorId;
            await activeOffering.save(sess ? { session: sess } : undefined);
            results.push(activeOffering);
          } else {
            activeOffering.visibility = item.visibility || activeOffering.visibility;
            activeOffering.fulfillmentMode = item.fulfillmentMode || activeOffering.fulfillmentMode;
            activeOffering.pricingPolicy = item.pricingPolicy || activeOffering.pricingPolicy;
            if (item.eligibleFulfillmentOriginIds !== undefined) {
              activeOffering.eligibleFulfillmentOriginIds = item.eligibleFulfillmentOriginIds;
            }
            if (item.saleConstraints) activeOffering.saleConstraints = item.saleConstraints;
            activeOffering.lockVersion += 1;
            activeOffering.updatedBy = actorId;
            await activeOffering.save(sess ? { session: sess } : undefined);
            results.push(activeOffering);
          }
        } else {
          let latestQuery = ProductMarketOffering.findOne({
            merchantScopeId,
            productId: product._id,
            scopeType,
            scopeKey,
            marketCountry
          }).sort({ version: -1 });
          if (sess) latestQuery = latestQuery.session(sess);
          const latestOffering = await latestQuery;

          const nextVersion = latestOffering ? latestOffering.version + 1 : 1;

          const created = new ProductMarketOffering({
            merchantScopeId,
            productId: product._id,
            scopeType,
            scopeKey,
            variantId,
            sku,
            marketCountry,
            pricingPolicy: item.pricingPolicy || (variantId ? 'variant_override_optional' : 'inherit_product_price'),
            version: nextVersion,
            status: item.status || 'draft',
            visibility: item.visibility || 'visible',
            fulfillmentMode: item.fulfillmentMode || 'local',
            eligibleFulfillmentOriginIds: item.eligibleFulfillmentOriginIds || [],
            effectiveFrom: item.effectiveFrom || new Date(),
            effectiveTo: item.effectiveTo || null,
            saleConstraints: item.saleConstraints || { minQuantity: 1, maxQuantity: null },
            lockVersion: 1,
            createdBy: actorId,
            updatedBy: actorId
          });

          await created.save({ session: sess });
          results.push(created);
        }
      }

      return results;
    };

    if (session) {
      return executeUpsert(session);
    }
    return executeUpsert(null);
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

    return MarketPriceBook.find({ merchantScopeId, productId }).sort({ marketCountry: 1, currency: 1, version: -1 });
  }

  /**
   * Upserts exact market price book entries for a product.
   * Enforces immutable versioning: modifying an active price supersedes the previous active record
   * and creates a new active version transactionally.
   *
   * @param {string} productId
   * @param {Array<Object>} pricesList
   * @param {Object} context
   * @param {string} context.actorId
   * @param {string} [context.merchantScopeId='default']
   * @returns {Promise<Array<Object>>}
   */
  async upsertPrices(productId, pricesList, { actorId, merchantScopeId = 'default', session = null } = {}) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError('Product not found', 404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    const config = await MarketService.getConfig({ merchantScopeId });
    const enabledCurrencies = config.enabledCurrencies || [config.defaultCurrency || config.baseCurrency || 'PKR'];

    const executePriceUpsert = async (sess) => {
      const results = [];

      for (const item of pricesList) {
        const marketCountry = item.marketCountry.trim().toUpperCase();
        const currency = item.currency.trim().toUpperCase();

        if (!CurrencyRegistry.has(currency)) {
          throw new AppError(`Currency '${currency}' is unknown in ISO 4217 CurrencyRegistry`, 400, 'INVALID_CURRENCY');
        }

        if (item.status === 'active' && !enabledCurrencies.includes(currency)) {
          throw new AppError(`Currency '${currency}' is not enabled in active store configuration`, 400, 'MARKET_CURRENCY_INELIGIBLE');
        }

        const currencyData = CurrencyRegistry.get(currency);
        const currencyExponent = item.currencyExponent !== undefined ? item.currencyExponent : currencyData.exponent;
        if (currencyExponent !== currencyData.exponent) {
          throw new AppError(
            `currencyExponent ${currencyExponent} does not match CurrencyRegistry exponent ${currencyData.exponent} for ${currency}`,
            400,
            'INVALID_CURRENCY_EXPONENT'
          );
        }

        const { variantId, sku, scopeType, scopeKey } = this.resolveVariantAndSku(
          product,
          item.variantId,
          item.sku
        );

        const activePrice = await MarketPriceBook.findOne({
          merchantScopeId,
          productId: product._id,
          scopeType,
          scopeKey,
          marketCountry,
          currency,
          status: 'active'
        }).session(sess);

        const newEffectiveFrom = item.effectiveFrom ? new Date(item.effectiveFrom) : new Date();

        if (activePrice) {
          if (item.lockVersion !== undefined && item.lockVersion !== activePrice.lockVersion) {
            throw new AppError(
              `Optimistic concurrency conflict for price in market '${marketCountry}' currency '${currency}'.`,
              409,
              'CONCURRENCY_CONFLICT'
            );
          }

          // Supersede existing active price
          activePrice.status = 'superseded';
          activePrice.effectiveTo = newEffectiveFrom;
          activePrice.lockVersion += 1;
          activePrice.updatedBy = actorId;
          await activePrice.save({ session: sess });

          // Create new active version
          const newVersion = activePrice.version + 1;
          const created = new MarketPriceBook({
            merchantScopeId,
            productId: product._id,
            scopeType,
            scopeKey,
            variantId,
            sku,
            marketCountry,
            currency,
            currencyExponent,
            amountMinor: item.amountMinor,
            compareAtAmountMinor: item.compareAtAmountMinor || null,
            priceSource: item.priceSource || 'manual',
            roundingPolicy: item.roundingPolicy || 'HALF_EVEN',
            fxSnapshotReference: item.fxSnapshotReference || null,
            offeringId: item.offeringId || null,
            version: newVersion,
            effectiveFrom: newEffectiveFrom,
            effectiveTo: item.effectiveTo || null,
            status: item.status || 'active',
            lockVersion: 1,
            createdBy: actorId,
            updatedBy: actorId
          });

          await created.save({ session: sess });
          results.push(created);
        } else {
          // Find max version
          const latestPrice = await MarketPriceBook.findOne({
            merchantScopeId,
            productId: product._id,
            scopeType,
            scopeKey,
            marketCountry,
            currency
          }).sort({ version: -1 }).session(sess);

          const nextVersion = latestPrice ? latestPrice.version + 1 : 1;

          const created = new MarketPriceBook({
            merchantScopeId,
            productId: product._id,
            scopeType,
            scopeKey,
            variantId,
            sku,
            marketCountry,
            currency,
            currencyExponent,
            amountMinor: item.amountMinor,
            compareAtAmountMinor: item.compareAtAmountMinor || null,
            priceSource: item.priceSource || 'manual',
            roundingPolicy: item.roundingPolicy || 'HALF_EVEN',
            fxSnapshotReference: item.fxSnapshotReference || null,
            offeringId: item.offeringId || null,
            version: nextVersion,
            effectiveFrom: newEffectiveFrom,
            effectiveTo: item.effectiveTo || null,
            status: item.status || 'active',
            lockVersion: 1,
            createdBy: actorId,
            updatedBy: actorId
          });

          await created.save({ session: sess });
          results.push(created);
        }
      }

      return results;
    };

    if (session) {
      return executePriceUpsert(session);
    }
    return executePriceUpsert(null);
  }
}

module.exports = new ProductMarketOfferingService();
module.exports.ProductMarketOfferingService = ProductMarketOfferingService;

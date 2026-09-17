/**
 * @file CheckoutQuoteService.js
 * @description Canonical Global Checkout Eligibility and Quote Orchestration Service.
 * Implements atomic quote generation, seller/destination resolution, multi-service shipping,
 * exact-money tax/duties landed-cost calculation, and stale/tamper quote protection governed by
 * active CommerceConfigurationVersion.
 */

const crypto = require('crypto');
const MarketService = require('../MarketService');
const CommerceConfigurationService = require('../commerce/CommerceConfigurationService');
const Product = require('../../models/Product');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const CouponService = require('../order/CouponService');
const TaxDutyEngine = require('./TaxDutyEngine');
const shippingAdapterRegistry = require('./shipping/ShippingAdapterRegistry');
const defaultPaymentPolicy = require('../payment/PaymentCapabilityPolicy');
const ProductVisibilityPolicy = require('../product/ProductVisibilityPolicy');
const InventoryAvailabilityService = require('../inventory/InventoryAvailabilityService');
const InventoryAllocationService = require('../inventory/InventoryAllocationService');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const ShippingServiceabilityService = require('../shipping/ShippingServiceabilityService');
const DeliveryPromiseService = require('../shipping/DeliveryPromiseService');
const {
  Money,
  MoneyMapper,
  Address,
  Phone,
  CountryRegistry,
  CurrencyRegistry
} = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

const QUOTE_TTL_SECONDS = 15 * 60; // 15 minutes default quote validity
const CURRENT_QUOTE_KEY_ID = 'v2';

const defaultServiceabilityService = new ShippingServiceabilityService();
const defaultDeliveryPromiseService = new DeliveryPromiseService();

/**
 * Resolves the authoritative dedicated signing secret for checkout quotes.
 * Fails closed in production/staging if unconfigured or weak.
 * @returns {string}
 */
function getCheckoutQuoteSecret() {
  const secret = process.env.CHECKOUT_QUOTE_SECRET || process.env.COMMERCE_QUOTE_SECRET;
  const env = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
  const isProduction = env === 'production' || env === 'staging';

  if (!secret) {
    if (isProduction) {
      throw new AppError(
        'CHECKOUT_QUOTE_SECRET is strictly required in production/staging environments',
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }
    return 'mevapur-dev-test-checkout-quote-signing-key-32bytes-min';
  }

  if (secret.length < 32) {
    if (isProduction) {
      throw new AppError(
        'CHECKOUT_QUOTE_SECRET must be at least 32 characters in production/staging',
        500,
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }
  }

  return secret;
}

/**
 * Timing-safe HMAC signature comparison.
 * @param {string} sigA
 * @param {string} sigB
 * @returns {boolean}
 */
function safeCompareSignatures(sigA, sigB) {
  if (typeof sigA !== 'string' || typeof sigB !== 'string') return false;
  const bufA = Buffer.from(sigA, 'hex');
  const bufB = Buffer.from(sigB, 'hex');
  if (bufA.length === 0 || bufB.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

class CheckoutQuoteService {
  constructor({
    marketService = MarketService,
    taxEngine = TaxDutyEngine,
    shippingRegistry = shippingAdapterRegistry,
    paymentPolicy = defaultPaymentPolicy,
    commerceConfigService = CommerceConfigurationService,
    inventoryAllocationService = InventoryAllocationService,
    serviceabilityService = defaultServiceabilityService,
    deliveryPromiseService = defaultDeliveryPromiseService
  } = {}) {
    this.marketService = marketService;
    this.taxEngine = taxEngine;
    this.shippingRegistry = shippingRegistry;
    this.paymentPolicy = paymentPolicy;
    this.commerceConfigService = commerceConfigService;
    this.inventoryAllocationService = inventoryAllocationService;
    this.serviceabilityService = serviceabilityService;
    this.deliveryPromiseService = deliveryPromiseService;
  }

  /**
   * Normalizes a postal code string for canonical comparison and hashing.
   * @param {string} postalCode
   * @returns {string}
   */
  static normalizePostalCode(postalCode) {
    if (!postalCode || typeof postalCode !== 'string') return '';
    return postalCode.trim().toUpperCase();
  }

  /**
   * Computes deterministic SHA-256 hash of normalized postal code without exposing raw PII.
   * @param {string|Object} shippingAddress
   * @returns {string}
   */
  static hashPostalCode(shippingAddress) {
    const raw = typeof shippingAddress === 'string'
      ? shippingAddress
      : (shippingAddress?.postalCode || shippingAddress?.zip || '');
    const normalized = CheckoutQuoteService.normalizePostalCode(raw);
    if (!normalized) return '';
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Computes deterministic SHA-256 hash of ordered items and prices.
   * @param {Array<Object>} items
   * @returns {string}
   */
  static hashItems(items) {
    const canonical = [...items]
      .map((item) => ({
        productId: String(item.product || item.productId),
        variantId: item.variantId ? String(item.variantId) : null,
        quantity: Number(item.quantity),
        priceMinor: String(item.unitPriceExact?.amountMinor || item.priceMinor || '')
      }))
      .sort((a, b) => `${a.productId}:${a.variantId || ''}`.localeCompare(`${b.productId}:${b.variantId || ''}`));

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  /**
   * Instance alias for hashItems.
   */
  hashItems(items) {
    return CheckoutQuoteService.hashItems(items);
  }

  /**
   * Builds canonical signable payload representation for quote signing.
   * @param {Object} quotePayload
   * @returns {Object}
   */
  buildSignablePayload(quotePayload) {
    const getMinorStr = (exactObj) => {
      if (!exactObj) return '0';
      const raw = exactObj.amountMinor !== undefined ? exactObj.amountMinor : exactObj;
      if (raw && typeof raw === 'object' && raw.$numberDecimal) return String(raw.$numberDecimal);
      if (raw && typeof raw === 'object' && typeof raw.toString === 'function') return raw.toString();
      return String(raw || '0');
    };

    const destinationCountry = (quotePayload.destination?.countryCode || quotePayload.destinationCountry || '').trim().toUpperCase();
    const destinationSubdivision = (quotePayload.destination?.province || quotePayload.destination?.administrativeArea || quotePayload.destinationSubdivision || '').trim().toUpperCase();
    const rawPostal = (quotePayload.destination?.postalCode || quotePayload.destinationPostalCode || '');
    const destinationPostalFingerprint = quotePayload.destinationPostalFingerprint !== undefined && quotePayload.destinationPostalFingerprint !== null
      ? quotePayload.destinationPostalFingerprint
      : CheckoutQuoteService.hashPostalCode(rawPostal);

    const taxProvenance = quotePayload.taxesAndDuties?.provenance || quotePayload.taxRuleProvenance || {};
    const taxRuleId = taxProvenance.ruleId || quotePayload.taxRuleId || '';
    const taxRulePriority = taxProvenance.priority !== undefined
      ? Number(taxProvenance.priority)
      : (quotePayload.taxRulePriority !== undefined ? Number(quotePayload.taxRulePriority) : 100);
    const taxType = quotePayload.taxesAndDuties?.taxType || taxProvenance.taxType || quotePayload.taxType || 'VAT';
    const taxTreatment = taxProvenance.taxTreatment || quotePayload.taxTreatment || 'exclusive';
    const taxableBasis = taxProvenance.taxableBasis || quotePayload.taxableBasis || 'subtotal';
    const taxRateNumerator = Number(taxProvenance.taxRateNumerator !== undefined ? taxProvenance.taxRateNumerator : (quotePayload.taxRateNumerator || 0));
    const taxRateDenominator = Number(taxProvenance.taxRateDenominator !== undefined ? taxProvenance.taxRateDenominator : (quotePayload.taxRateDenominator || 10000));
    const dutyRateNumerator = Number(taxProvenance.dutyRateNumerator !== undefined ? taxProvenance.dutyRateNumerator : (quotePayload.dutyRateNumerator || 0));
    const dutyRateDenominator = Number(taxProvenance.dutyRateDenominator !== undefined ? taxProvenance.dutyRateDenominator : (quotePayload.dutyRateDenominator || 10000));
    const roundingMode = taxProvenance.roundingMode || quotePayload.roundingMode || 'HALF_UP';
    const roundingScope = taxProvenance.roundingScope || quotePayload.roundingScope || 'subtotal';
    const incoterm = quotePayload.incoterm || taxProvenance.incoterm || 'DOMESTIC';
    const providerType = taxProvenance.providerType || quotePayload.providerType || 'MANUAL_GOVERNED';
    const sourceAuthority = taxProvenance.sourceAuthority || quotePayload.sourceAuthority || '';
    const sourceReference = taxProvenance.sourceReference || quotePayload.sourceReference || '';
    const verificationStatus = taxProvenance.verificationStatus || quotePayload.verificationStatus || 'VERIFIED_LEGAL_RULE';
    const dutyRefundPolicy = taxProvenance.dutyRefundPolicy || quotePayload.dutyRefundPolicy || null;
    const taxRefundPolicy = taxProvenance.taxRefundPolicy || quotePayload.taxRefundPolicy || null;

    const goodsValueMinor = getMinorStr(quotePayload.goodsValueExact || quotePayload.taxesAndDuties?.goodsValueExact || quotePayload.goodsValueMinor || quotePayload.totals?.subtotalExact);
    const customsValueMinor = getMinorStr(quotePayload.customsValueExact || quotePayload.taxesAndDuties?.customsValueExact || quotePayload.customsValueMinor || quotePayload.totals?.subtotalExact);
    const cifValueMinor = getMinorStr(quotePayload.cifValueExact || quotePayload.taxesAndDuties?.cifValueExact || quotePayload.cifValueMinor || quotePayload.totals?.subtotalExact);
    const customsValueIncludesShipping = Boolean(taxProvenance.customsValueIncludesShipping !== undefined ? taxProvenance.customsValueIncludesShipping : quotePayload.customsValueIncludesShipping);
    const customsValueIncludesInsurance = Boolean(taxProvenance.customsValueIncludesInsurance !== undefined ? taxProvenance.customsValueIncludesInsurance : quotePayload.customsValueIncludesInsurance);

    const insuranceAmountMinor = getMinorStr(taxProvenance.insuranceAmountExact || quotePayload.taxesAndDuties?.provenance?.insuranceAmountExact || quotePayload.insuranceAmountExact || quotePayload.insuranceAmountMinor);
    const insuranceProvenance = taxProvenance.insuranceProvenance || quotePayload.taxesAndDuties?.provenance?.insuranceProvenance || quotePayload.insuranceProvenance || 'NO_INSURANCE_CHARGE';

    const estimatedDutyMinor = getMinorStr(quotePayload.taxesAndDuties?.estimatedDutyExact || quotePayload.estimatedDutyExact || quotePayload.estimatedDutyMinor || quotePayload.dutyMinor);
    const payableDutyMinor = getMinorStr(quotePayload.taxesAndDuties?.payableDutyExact || quotePayload.payableDutyExact || quotePayload.payableDutyMinor || quotePayload.dutyMinor || quotePayload.totals?.dutiesExact);
    const taxMinor = getMinorStr(quotePayload.totals?.taxExact || quotePayload.taxesAndDuties?.taxAmountExact || quotePayload.taxMinor);
    const additionalTaxMinor = getMinorStr(quotePayload.totals?.additionalTaxExact || quotePayload.taxesAndDuties?.additionalTaxAmountExact || quotePayload.additionalTaxMinor);
    const taxIncludedMinor = getMinorStr(quotePayload.totals?.taxIncludedExact || quotePayload.taxesAndDuties?.taxIncludedAmountExact || quotePayload.taxIncludedMinor);

    const dutyDeMinimis = quotePayload.taxesAndDuties?.dutyDeMinimis || quotePayload.dutyDeMinimis || {
      configured: false,
      exempt: false,
      reasonCode: 'NO_THRESHOLD_CONFIGURED'
    };
    const taxDeMinimis = quotePayload.taxesAndDuties?.taxDeMinimis || quotePayload.taxDeMinimis || {
      configured: false,
      exempt: false,
      reasonCode: 'NO_THRESHOLD_CONFIGURED'
    };

    const rawItems = quotePayload.items || quotePayload.customsItems || [];
    const customsItems = rawItems.map((it) => ({
      productId: String(it.productId || it.product),
      variantId: it.variantId ? String(it.variantId) : null,
      quantity: Number(it.quantity),
      hsCode: it.hsCode || null,
      countryOfOrigin: it.countryOfOrigin || null,
      customsDescription: it.customsDescription || '',
      declaredValueEligibility: it.declaredValueEligibility || 'UNKNOWN',
      dangerousGoodsClassification: it.dangerousGoodsClassification || 'UNKNOWN',
      weightGrams: Number(it.weightGrams || 0)
    })).sort((a, b) => `${a.productId}:${a.variantId || ''}`.localeCompare(`${b.productId}:${b.variantId || ''}`));

    return {
      kid: quotePayload.kid || CURRENT_QUOTE_KEY_ID,
      quoteId: quotePayload.quoteId,
      merchantScopeId: quotePayload.merchantScopeId || 'default',
      configVersionId: quotePayload.configVersionId || 'v1',
      authorityRevision: quotePayload.authorityRevision || null,
      merchantCountry: quotePayload.merchantCountry,
      fulfillmentOriginCountry: quotePayload.fulfillmentOriginCountry || quotePayload.merchantCountry,
      destinationCountry,
      destinationSubdivision,
      destinationPostalFingerprint,
      currency: quotePayload.currency,
      itemsHash: quotePayload.itemsHash,
      subtotalMinor: quotePayload.subtotalMinor || getMinorStr(quotePayload.totals?.subtotalExact),
      discountMinor: quotePayload.discountMinor || getMinorStr(quotePayload.totals?.discountExact),
      shippingMinor: quotePayload.shippingMinor || getMinorStr(quotePayload.totals?.shippingExact),
      taxMinor,
      additionalTaxMinor,
      taxIncludedMinor,
      estimatedDutyMinor,
      payableDutyMinor,
      dutyMinor: payableDutyMinor,
      insuranceAmountMinor,
      insuranceProvenance,
      grandTotalMinor: quotePayload.grandTotalMinor || getMinorStr(quotePayload.totals?.grandTotalExact),
      incoterm,
      taxRuleId,
      taxRulePriority,
      taxType,
      taxTreatment,
      taxableBasis,
      taxRateNumerator,
      taxRateDenominator,
      dutyRateNumerator,
      dutyRateDenominator,
      roundingMode,
      roundingScope,
      providerType,
      sourceAuthority,
      sourceReference,
      verificationStatus,
      dutyRefundPolicy,
      taxRefundPolicy,
      goodsValueMinor,
      customsValueMinor,
      cifValueMinor,
      customsValueIncludesShipping,
      customsValueIncludesInsurance,
      dutyDeMinimis,
      taxDeMinimis,
      customsItems,
      shippingServiceLevel: quotePayload.shippingServiceLevel || quotePayload.shipping?.selectedOption?.serviceLevel || 'standard',
      shipmentGroups: (quotePayload.shipmentGroups || quotePayload.shipping?.shipmentGroups || []).map((g) => ({
        groupId: g.groupId || g.shipmentGroup || 'group_1',
        locationId: String(g.locationId || ''),
        locationCode: g.locationCode || '',
        originCountry: g.originCountry || '',
        serviceLevel: g.serviceLevel || quotePayload.shippingServiceLevel || quotePayload.shipping?.selectedOption?.serviceLevel || 'standard',
        shippingMinor: getMinorStr(g.shippingAmountExact || g.shippingMinor),
        items: (g.items || []).map((it) => ({
          productId: String(it.productId || it.product),
          variantId: it.variantId ? String(it.variantId) : null,
          quantity: Number(it.quantity)
        }))
      })),
      issuedAt: quotePayload.issuedAt,
      expiresAt: quotePayload.expiresAt
    };
  }

  /**
   * Generates a tamper-proof cryptographic signature for a quote payload.
   * @param {Object} quotePayload
   * @returns {string}
   */
  signQuote(quotePayload) {
    const signable = this.buildSignablePayload(quotePayload);

    return crypto
      .createHmac('sha256', getCheckoutQuoteSecret())
      .update(JSON.stringify(signable))
      .digest('hex');
  }

  /**
   * Resolves and validates cart items, calculating exact unit prices, line totals, and customs metadata.
   * @param {Array<Object>} items
   * @param {string} currency
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>}
   */
  async resolvePricedItems(items, currency, { session = null, destinationCountry = null, merchantScopeId = 'default' } = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Checkout items array cannot be empty', 400, ERROR_CODES.ORDER_VALIDATION_FAILED);
    }

    const resolved = [];
    const seen = new Set();
    const activeCategoryIds = await ProductVisibilityPolicy.getActiveCategoryIds({ session });

    for (const item of items) {
      const productId = item.productId || item._id;
      if (!productId) {
        throw new AppError('Item must have a valid productId', 400, ERROR_CODES.ORDER_VALIDATION_FAILED);
      }

      const product = await Product.findById(productId).session(session);
      if (!product || !product.isActive || product.status !== 'published') {
        throw new AppError(
          `Product '${product?.name || productId}' is unavailable or inactive`,
          409,
          ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE
        );
      }

      const isCategoryEligible = await ProductVisibilityPolicy.isProductCategoryEligible(product, {
        session,
        activeCategoryIds
      });
      if (!isCategoryEligible) {
        throw new AppError(
          `Product '${product.name}' is categorized under an inactive category`,
          409,
          ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE
        );
      }

      let variant = null;
      if (item.variantId) {
        variant = product.variants.id(item.variantId);
        if (!variant) {
          throw new AppError(
            `Selected variant is unavailable for product '${product.name}'`,
            409,
            ERROR_CODES.ORDER_VARIANT_NOT_FOUND
          );
        }
      } else if (product.variants && product.variants.length > 0) {
        variant = product.variants.find((v) => v.isDefault) || product.variants[0];
      }

      const itemKey = `${product._id}:${variant ? variant._id : 'root'}`;
      if (seen.has(itemKey)) {
        throw new AppError('Duplicate item lines are not allowed in checkout quote', 400, ERROR_CODES.ORDER_VALIDATION_FAILED);
      }
      seen.add(itemKey);

      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new AppError('Item quantity must be a positive integer', 400, ERROR_CODES.ORDER_VALIDATION_FAILED);
      }

      // Check market-scoped ATP availability
      const availability = await InventoryAvailabilityService.getAvailability({
        productId: product._id,
        variantId: variant?._id || null,
        marketCountry: destinationCountry || 'PK',
        merchantScopeId: merchantScopeId || 'default'
      });

      if (!availability.isPurchasable || availability.atp < quantity) {
        throw new AppError(
          `Insufficient stock for '${product.name}${variant ? ` (${variant.sku || 'variant'})` : ''}'. Requested: ${quantity}, Available: ${availability.atp}`,
          409,
          'INSUFFICIENT_STOCK'
        );
      }

      let unitPriceMoney;
      let offering = null;
      let priceBookEntry = null;
      let pricingPolicy = 'variant_override_optional';
      let pricingPolicyApplied = 'legacy_home_fallback';

      if (destinationCountry) {
        const now = new Date();
        const activeScopeOffering = variant
          ? await ProductMarketOffering.findOne({
              merchantScopeId,
              productId: product._id,
              scopeType: 'variant',
              scopeKey: String(variant._id),
              marketCountry: destinationCountry,
              status: 'active',
              visibility: 'visible',
              effectiveFrom: { $lte: now },
              $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
            }).session(session)
          : null;

        const activeProductOffering = await ProductMarketOffering.findOne({
          merchantScopeId,
          productId: product._id,
          scopeType: 'product',
          scopeKey: 'product',
          marketCountry: destinationCountry,
          status: 'active',
          visibility: 'visible',
          effectiveFrom: { $lte: now },
          $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
        }).session(session);

        offering = activeScopeOffering || activeProductOffering;
        pricingPolicy = activeScopeOffering?.pricingPolicy
          || activeProductOffering?.pricingPolicy
          || (variant ? 'variant_override_optional' : 'inherit_product_price');

        if (variant) {
          // 1. Check dedicated variant price
          const variantPrice = await MarketPriceBook.findOne({
            merchantScopeId,
            productId: product._id,
            scopeType: 'variant',
            scopeKey: String(variant._id),
            marketCountry: destinationCountry,
            currency,
            status: 'active',
            effectiveFrom: { $lte: now },
            $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
          }).session(session);

          if (variantPrice) {
            priceBookEntry = variantPrice;
            pricingPolicyApplied = 'variant_override';
          } else {
            // Check inheritance policy
            if (pricingPolicy === 'variant_override_required') {
              throw new AppError(
                `Variant '${variant.sku || variant._id}' requires a dedicated variant price in market '${destinationCountry}' currency '${currency}'`,
                409,
                'VARIANT_PRICE_REQUIRED'
              );
            }

            const productPrice = await MarketPriceBook.findOne({
              merchantScopeId,
              productId: product._id,
              scopeType: 'product',
              scopeKey: 'product',
              marketCountry: destinationCountry,
              currency,
              status: 'active',
              effectiveFrom: { $lte: now },
              $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
            }).session(session);

            if (productPrice) {
              priceBookEntry = productPrice;
              pricingPolicyApplied = 'inherit_product_price';
            }
          }
        } else {
          // Product-level pricing
          const productPrice = await MarketPriceBook.findOne({
            merchantScopeId,
            productId: product._id,
            scopeType: 'product',
            scopeKey: 'product',
            marketCountry: destinationCountry,
            currency,
            status: 'active',
            effectiveFrom: { $lte: now },
            $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
          }).session(session);

          if (productPrice) {
            priceBookEntry = productPrice;
            pricingPolicyApplied = 'product_price';
          }
        }
      }

      if (!priceBookEntry) {
        throw new AppError(
          `No active price found for product '${product.name}' in market '${destinationCountry}' currency '${currency}'`,
          409,
          'PRICE_NOT_FOUND'
        );
      }

      unitPriceMoney = Money.fromMinor(priceBookEntry.amountMinor, currency);

      const lineTotalMoney = unitPriceMoney.multiplyRational(quantity, 1);

      // Logistics & Customs Resolution
      const rawWeight = (variant?.weightGrams !== undefined && variant?.weightGrams !== null)
        ? variant.weightGrams
        : product.weightGrams;

      const parsedWeight = Number(rawWeight);
      if (!Number.isInteger(parsedWeight) || parsedWeight <= 0) {
        throw new AppError(
          `Product '${product.name}' is missing valid integer weightGrams for shipping calculations`,
          400,
          'SHIPPING_WEIGHT_REQUIRED'
        );
      }
      const weightGrams = parsedWeight;

      const dangerousGoodsClassification = variant?.dangerousGoodsClassification
        || product.dangerousGoodsClassification
        || 'UNKNOWN';

      const declaredValueEligibility = variant?.declaredValueEligibility
        || product.declaredValueEligibility
        || 'UNKNOWN';

      const hsCode = variant?.hsClassification?.code || variant?.customsTariff?.code || product.hsClassification?.code || product.customsTariff?.code || null;
      const countryOfOrigin = variant?.countryOfOrigin || product.countryOfOrigin || null;
      const customsDescription = variant?.customsDescription || product.customsDescription || product.shortDescription || product.name;

      resolved.push({
        product: product._id,
        productId: String(product._id),
        variantId: variant ? variant._id : null,
        name: product.name,
        sku: variant?.sku || product.sku || '',
        variant: variant ? variant.attributes?.map((a) => `${a.name}: ${a.value}`).join(', ') : '',
        quantity,
        unitPrice: Number(unitPriceMoney.toDecimalString()),
        unitPriceExact: MoneyMapper.toPersistence(unitPriceMoney),
        lineTotal: Number(lineTotalMoney.toDecimalString()),
        lineTotalExact: MoneyMapper.toPersistence(lineTotalMoney),
        weightGrams: weightGrams * quantity,
        dangerousGoodsClassification,
        declaredValueEligibility,
        hsCode,
        countryOfOrigin,
        customsDescription,
        image: variant?.images?.[0] || product.primaryImage || product.images?.[0] || product.image || '',
        offeringId: offering ? String(offering._id) : null,
        offeringLockVersion: offering ? offering.lockVersion : null,
        offeringVersion: offering ? offering.version : null,
        priceBookEntryId: priceBookEntry ? String(priceBookEntry._id) : null,
        priceBookLockVersion: priceBookEntry ? priceBookEntry.lockVersion : null,
        priceBookVersion: priceBookEntry ? priceBookEntry.version : null,
        pricingPolicy,
        pricingPolicyApplied,
        priceSource: priceBookEntry ? priceBookEntry.priceSource : 'legacy',
        fulfillmentMode: offering ? offering.fulfillmentMode : 'local'
      });
    }

    return resolved;
  }

  /**
   * Generate an Authoritative Checkout Quote.
   * @param {Object} params
   * @param {string} [params.userId]
   * @param {string} [params.merchantScopeId='default']
   * @param {Array<Object>} params.items
   * @param {Object} params.shippingAddress
   * @param {string} [params.currency]
   * @param {string} [params.couponCode]
   * @param {string} [params.shippingServiceLevel='standard']
   * @param {string} [params.shippingAdapter]
   * @returns {Promise<Object>}
   */
  async generateQuote({
    userId = null,
    merchantScopeId = 'default',
    items,
    shippingAddress,
    currency = null,
    couponCode = null,
    shippingServiceLevel = 'standard',
    shippingAdapter = null
  }) {
    // 1. Authoritative Seller & Market Context
    const market = await this.marketService.getConfig({ merchantScopeId });
    if (!market || !market.isEnabled) {
      throw new AppError('Market configuration is currently disabled', 503, 'MARKET_DISABLED');
    }

    if (!market.isGovernedVersion || !market.activeVersionDoc) {
      throw new AppError('Active commerce configuration version is required for checkout quote', 503, 'MARKET_CONFIGURATION_UNAVAILABLE');
    }

    const activeConfigDoc = market.activeVersionDoc;
    const configVersionId = market.configVersionId || 'v1';
    const rawMerchantCountry = market.merchantCountry || market.homeCountry;
    if (!rawMerchantCountry) {
      throw new AppError('Governed merchantCountry is missing in active configuration', 503, 'MARKET_CONFIGURATION_UNAVAILABLE');
    }
    const merchantCountry = rawMerchantCountry.toUpperCase();

    // 2. Validate and Normalize Destination Address
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      throw new AppError('Valid shipping address is required for checkout quote', 400, 'ADDRESS_REQUIRED');
    }

    const normalizedAddress = Address.create({
      fullName: shippingAddress.fullName || 'Valued Customer',
      addressLine1: shippingAddress.address || shippingAddress.addressLine1,
      addressLine2: shippingAddress.addressLine2,
      locality: shippingAddress.city || shippingAddress.locality,
      administrativeArea: shippingAddress.province || shippingAddress.administrativeArea || shippingAddress.state,
      postalCode: shippingAddress.postalCode || shippingAddress.zip,
      countryCode: shippingAddress.countryCode || shippingAddress.country,
      phone: shippingAddress.phone
    });

    const destinationCountry = normalizedAddress.countryCode;
    const isDomestic = destinationCountry === merchantCountry;

    // Validate phone E.164 if provided
    let parsedPhone = null;
    if (shippingAddress.phone) {
      try {
        parsedPhone = Phone.parse(shippingAddress.phone, { defaultCountry: destinationCountry });
      } catch {
        // Keep raw phone if parser throws non-fatal validation
      }
    }

    // 3. Resolve & Verify Currency
    const rawCurrency = currency || market.defaultCurrency || market.baseCurrency;
    if (!rawCurrency) {
      throw new AppError('Currency is missing in active configuration', 503, 'MARKET_CONFIGURATION_UNAVAILABLE');
    }
    const targetCurrency = rawCurrency.toUpperCase();
    await this.marketService.assertEligible({
      country: destinationCountry,
      currency: targetCurrency,
      merchantScopeId
    });

    // 4. Resolve Items & Subtotal
    const pricedItems = await this.resolvePricedItems(items, targetCurrency, {
      destinationCountry,
      merchantScopeId
    });

    // Enforce Product Customs Metadata for International routes
    if (!isDomestic) {
      for (const it of pricedItems) {
        if (!it.hsCode || !/^\d{6,10}$/.test(it.hsCode)) {
          throw new AppError(
            `Product '${it.name}' is missing a valid 6-10 digit HS code for international shipping`,
            409,
            'CUSTOMS_METADATA_INCOMPLETE'
          );
        }
        if (!it.countryOfOrigin) {
          throw new AppError(
            `Product '${it.name}' is missing country of origin for international shipping`,
            409,
            'CUSTOMS_METADATA_INCOMPLETE'
          );
        }
        if (!it.customsDescription || !it.customsDescription.trim()) {
          throw new AppError(
            `Product '${it.name}' is missing customs description for international shipping`,
            409,
            'CUSTOMS_METADATA_INCOMPLETE'
          );
        }
        if (it.declaredValueEligibility === 'UNKNOWN') {
          throw new AppError(
            `Product '${it.name}' declared-value eligibility is unclassified for international shipping`,
            409,
            'CUSTOMS_METADATA_INCOMPLETE'
          );
        }
        if (it.dangerousGoodsClassification === 'UNKNOWN' || it.dangerousGoodsClassification === 'UNCLASSIFIED') {
          throw new AppError(
            `Product '${it.name}' has unclassified dangerous goods status and cannot be quoted for international shipping`,
            409,
            'CUSTOMS_METADATA_INCOMPLETE'
          );
        }
      }
    }

    const subtotalMoney = pricedItems.reduce(
      (sum, item) => sum.add(MoneyMapper.toMoney(item.lineTotalExact)),
      Money.zero(targetCurrency)
    );
    const totalWeightGrams = pricedItems.reduce((sum, item) => sum + (item.weightGrams || 0), 0);

    // 5. Evaluate Coupon
    let discountMoney = Money.zero(targetCurrency);
    let freeShippingCoupon = false;
    let couponDetails = null;

    if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
      const couponResult = await CouponService.validateAndReserve({
        code: couponCode.trim(),
        subtotal: Number(subtotalMoney.toDecimalString()),
        items: pricedItems,
        userId,
        checkoutKey: `quote-preview-${Date.now()}`,
        currency: targetCurrency,
        session: null
      });

      if (couponResult) {
        discountMoney = Money.fromLegacyNumber(couponResult.discountAmount || 0, targetCurrency);
        freeShippingCoupon = Boolean(couponResult.freeShipping);
        couponDetails = {
          code: couponCode.trim().toUpperCase(),
          discountAmount: Number(discountMoney.toDecimalString()),
          discountAmountExact: MoneyMapper.toPersistence(discountMoney),
          freeShipping: freeShippingCoupon
        };
      }
    }

    // After-discount subtotal for shipping/tax calculation
    const afterDiscountMoney = subtotalMoney.amountMinor > discountMoney.amountMinor
      ? subtotalMoney.subtract(discountMoney)
      : Money.zero(targetCurrency);

    // 6. Preview Canonical Inventory Allocation to Determine Authoritative Fulfillment Origins
    const normalizedRequestedService = (shippingServiceLevel || 'standard').trim().toLowerCase();
    const allocationResult = await this.inventoryAllocationService.previewAllocation({
      items: pricedItems,
      destinationCountry,
      merchantScopeId,
      serviceLevel: normalizedRequestedService,
      allowSplit: true
    });

    if (!allocationResult || !allocationResult.success || !allocationResult.shipmentGroups || allocationResult.shipmentGroups.length === 0) {
      throw new AppError(
        allocationResult?.message || 'No authorized fulfillment origin available to fulfill the requested items',
        409,
        'NO_AUTHORIZED_FULFILLMENT_ORIGIN'
      );
    }

    const now = new Date();
    const shippingRules = activeConfigDoc?.shippingRules || null;

    // Resolve and Authorize each allocation shipment group's FulfillmentLocation atomically
    const validatedShipmentGroupOrigins = [];
    for (const group of allocationResult.shipmentGroups) {
      const locId = group.locationId || allocationResult.fulfillmentLocationId;
      if (!locId) {
        throw new AppError(
          'Missing fulfillment location ID in inventory allocation',
          409,
          'NO_AUTHORIZED_FULFILLMENT_ORIGIN'
        );
      }

      const fulfillmentLoc = await FulfillmentLocation.findOne({
        _id: locId,
        merchantScopeId,
        status: 'active',
        effectiveFrom: { $lte: now },
        supportedMarketCountries: destinationCountry,
        supportedServiceLevels: normalizedRequestedService,
        $or: [
          { effectiveTo: null },
          { effectiveTo: { $gte: now } }
        ]
      });

      if (!fulfillmentLoc) {
        throw new AppError(
          `No authorized fulfillment origin available for location '${locId}', market '${destinationCountry}', and service level '${normalizedRequestedService}'`,
          409,
          'NO_AUTHORIZED_FULFILLMENT_ORIGIN'
        );
      }

      validatedShipmentGroupOrigins.push({
        group,
        originLocation: {
          locationId: String(fulfillmentLoc._id),
          locationCode: fulfillmentLoc.locationCode,
          countryCode: fulfillmentLoc.countryCode.toUpperCase(),
          originCountry: fulfillmentLoc.countryCode.toUpperCase(),
          timeZone: fulfillmentLoc.timeZone
        }
      });
    }

    const primaryOrigin = validatedShipmentGroupOrigins[0].originLocation;
    const fulfillmentOrigin = primaryOrigin.countryCode;

    // 7. Multi-Service Shipping Quoting via Active Version Rules & Serviceability Engine
    const serviceabilityResult = await this.serviceabilityService.evaluateServiceability({
      countryCode: destinationCountry,
      originCountry: primaryOrigin.countryCode,
      originLocation: primaryOrigin,
      originTimeZone: primaryOrigin.timeZone,
      orderDate: now,
      subdivision: normalizedAddress.administrativeArea,
      postalCode: normalizedAddress.postalCode,
      city: normalizedAddress.locality,
      weightGrams: totalWeightGrams,
      subtotalMoney: afterDiscountMoney,
      currency: targetCurrency,
      shippingRules
    });

    if (!serviceabilityResult.isServiceable || !serviceabilityResult.options || serviceabilityResult.options.length === 0) {
      throw new AppError(
        serviceabilityResult.message || `No shipping rules configured for destination country '${destinationCountry}'`,
        409,
        'SHIPPING_ZONE_UNAVAILABLE'
      );
    }

    const shippingOptions = serviceabilityResult.options;

    const selectedShippingOption = shippingOptions.find(
      (opt) => (opt.serviceLevel || '').toLowerCase() === normalizedRequestedService
    ) || shippingOptions[0];

    const isFreeStandard = freeShippingCoupon && (selectedShippingOption.serviceLevel || '').toLowerCase() === 'standard';
    let selectedShippingMoney = isFreeStandard
      ? Money.zero(targetCurrency)
      : MoneyMapper.toMoney(selectedShippingOption.shippingAmountExact);

    // 8. Calculate Tax & Duties with Landed-Cost Provenance via Active Version Rules
    const taxRules = activeConfigDoc?.taxRules || null;
    const taxDutyResult = this.taxEngine.calculate({
      destinationCountry,
      originCountry: fulfillmentOrigin,
      administrativeArea: normalizedAddress.administrativeArea,
      goodsValue: afterDiscountMoney,
      taxableSubtotal: afterDiscountMoney,
      shippingAmount: selectedShippingMoney,
      insuranceAmount: Money.zero(targetCurrency),
      insuranceProvenance: 'NO_INSURANCE_CHARGE',
      currency: targetCurrency,
      taxRules,
      configVersionId,
      merchantScopeId
    });

    const taxMoney = MoneyMapper.toMoney(taxDutyResult.taxAmountExact);
    const additionalTaxMoney = MoneyMapper.toMoney(taxDutyResult.additionalTaxAmountExact);
    const taxIncludedMoney = MoneyMapper.toMoney(taxDutyResult.taxIncludedAmountExact);
    const estimatedDutiesMoney = MoneyMapper.toMoney(taxDutyResult.estimatedDutyExact);
    const payableDutiesMoney = MoneyMapper.toMoney(taxDutyResult.payableDutyExact);

    // 9. Deterministic Exact Grand Total
    // Exclusive: goodsValue + shipping + additionalTaxPayable + payableDuty
    // Inclusive: goodsValue + shipping + 0 + payableDuty (assessed tax is inside goodsValue)
    const grandTotalMoney = afterDiscountMoney
      .add(selectedShippingMoney)
      .add(additionalTaxMoney)
      .add(payableDutiesMoney);

    // Landed cost: goodsValue + shipping + additionalTaxPayable + estimatedDuty
    const landedCostMoney = afterDiscountMoney
      .add(selectedShippingMoney)
      .add(additionalTaxMoney)
      .add(estimatedDutiesMoney);

    // 10. Payment Method Eligibility Synthesis
    const availablePaymentMethods = await this.paymentPolicy.getPublicAvailableMethods({
      country: destinationCountry,
      deliveryCountry: destinationCountry,
      merchantCountry,
      currency: targetCurrency,
      baseCurrency: market.baseCurrency,
      amount: Number(grandTotalMoney.toDecimalString())
    });

    // Filter available methods for customer
    const eligiblePaymentMethods = (availablePaymentMethods || []).filter((m) => {
      // International routes reject COD by default
      if (!isDomestic && (m.code === 'cod' || m.paymentType === 'offline')) {
        return false;
      }
      return true;
    });

    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + QUOTE_TTL_SECONDS * 1000).toISOString();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const entropy = crypto.randomBytes(6).toString('hex').toUpperCase();
    const quoteId = `QUO-${dateStr}-${entropy}`;

    const itemsHash = this.hashItems(pricedItems);

    const aggregateDeliveryPromise = selectedShippingOption.deliveryPromise;

    const shipmentGroups = validatedShipmentGroupOrigins.map(({ group, originLocation }, idx) => ({
      groupId: group.shipmentGroup || `group_${idx + 1}`,
      locationId: originLocation.locationId,
      locationCode: originLocation.locationCode,
      originCountry: originLocation.countryCode,
      originTimeZone: originLocation.timeZone,
      destinationCountry,
      serviceLevel: selectedShippingOption.serviceLevel,
      shippingAmount: Number(selectedShippingMoney.toDecimalString()),
      shippingAmountExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(selectedShippingMoney)),
      deliveryEstimate: selectedShippingOption.deliveryEstimate,
      deliveryPromise: aggregateDeliveryPromise,
      provenance: selectedShippingOption.provenance || {
        source: 'GOVERNED_SHIPPING_TABLE',
        configVersionId: configVersionId || 'v-active',
        ruleId: selectedShippingOption.ruleId || 'RULE-DEF',
        timestamp: now.toISOString()
      },
      items: (group.items || pricedItems).map((it) => {
        const matchingPriced = pricedItems.find((p) => String(p.productId) === String(it.product || it.productId));
        return {
          productId: String(it.product || it.productId),
          variantId: it.variantId ? String(it.variantId) : (matchingPriced?.variantId || null),
          name: it.name || matchingPriced?.name || '',
          sku: it.sku || it.canonicalSku || matchingPriced?.sku || '',
          quantity: it.quantity,
          weightGrams: it.weightGrams || matchingPriced?.weightGrams || 0
        };
      })
    }));

    const quoteData = {
      kid: CURRENT_QUOTE_KEY_ID,
      quoteId,
      merchantScopeId,
      configVersionId,
      merchantCountry,
      fulfillmentOriginCountry: fulfillmentOrigin,
      isDomestic,
      incoterm: taxDutyResult.incoterm,
      destination: {
        fullName: normalizedAddress.fullName,
        address: normalizedAddress.addressLine1,
        addressLine2: normalizedAddress.addressLine2,
        city: normalizedAddress.locality,
        province: normalizedAddress.administrativeArea,
        postalCode: normalizedAddress.postalCode,
        countryCode: destinationCountry,
        country: CountryRegistry.getCountry(destinationCountry).name,
        phone: parsedPhone ? parsedPhone.e164 : (normalizedAddress.phone || '')
      },
      destinationPostalFingerprint: CheckoutQuoteService.hashPostalCode(normalizedAddress.postalCode),
      currency: targetCurrency,
      items: pricedItems,
      itemsHash,
      coupon: couponDetails,
      shipping: {
        selectedOption: {
          serviceLevel: selectedShippingOption.serviceLevel,
          zoneId: selectedShippingOption.ruleId || selectedShippingOption.zoneId,
          zoneName: selectedShippingOption.ruleName || selectedShippingOption.zoneName,
          amount: Number(selectedShippingMoney.toDecimalString()),
          amountExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(selectedShippingMoney)),
          freeShippingApplied: Boolean(isFreeStandard || selectedShippingOption.freeShippingApplied),
          isRemote: selectedShippingOption.isRemote,
          deliveryEstimate: selectedShippingOption.deliveryEstimate,
          deliveryPromise: aggregateDeliveryPromise,
          provenance: selectedShippingOption.provenance
        },
        availableOptions: shippingOptions.map((opt) => {
          const isOptionFree = freeShippingCoupon && (opt.serviceLevel || '').toLowerCase() === 'standard';
          return {
            serviceLevel: opt.serviceLevel,
            amount: isOptionFree ? 0 : opt.shippingAmount,
            amountExact: isOptionFree
              ? MoneyMapper.toJSON(MoneyMapper.toPersistence(Money.zero(targetCurrency)))
              : MoneyMapper.toJSON(opt.shippingAmountExact),
            deliveryEstimate: opt.deliveryEstimate,
            deliveryPromise: opt.deliveryPromise
          };
        }),
        deliveryPromise: aggregateDeliveryPromise,
        shipmentGroups
      },
      taxesAndDuties: {
        taxType: taxDutyResult.taxType,
        taxTreatment: taxDutyResult.taxTreatment,
        taxableBasis: taxDutyResult.taxableBasis,
        taxRatePercent: taxDutyResult.taxRatePercent,
        taxAmount: taxDutyResult.taxAmount,
        taxAmountExact: MoneyMapper.toJSON(taxDutyResult.taxAmountExact),
        additionalTaxAmount: taxDutyResult.additionalTaxAmount,
        additionalTaxAmountExact: MoneyMapper.toJSON(taxDutyResult.additionalTaxAmountExact),
        taxIncludedAmount: taxDutyResult.taxIncludedAmount,
        taxIncludedAmountExact: MoneyMapper.toJSON(taxDutyResult.taxIncludedAmountExact),
        dutyRatePercent: taxDutyResult.dutyRatePercent,
        estimatedDutyAmount: taxDutyResult.estimatedDutyAmount,
        estimatedDutyExact: MoneyMapper.toJSON(taxDutyResult.estimatedDutyExact),
        payableDutyAmount: taxDutyResult.payableDutyAmount,
        payableDutyExact: MoneyMapper.toJSON(taxDutyResult.payableDutyExact),
        dutyAmount: taxDutyResult.payableDutyAmount,
        dutyAmountExact: MoneyMapper.toJSON(taxDutyResult.payableDutyExact),
        goodsValue: taxDutyResult.goodsValue,
        goodsValueExact: MoneyMapper.toJSON(taxDutyResult.goodsValueExact),
        customsValue: taxDutyResult.customsValue,
        customsValueExact: MoneyMapper.toJSON(taxDutyResult.customsValueExact),
        cifValue: taxDutyResult.cifValue,
        cifValueExact: MoneyMapper.toJSON(taxDutyResult.cifValueExact),
        customsValueIncludesShipping: taxDutyResult.customsValueIncludesShipping,
        customsValueIncludesInsurance: taxDutyResult.customsValueIncludesInsurance,
        dutyDeMinimis: taxDutyResult.dutyDeMinimis,
        taxDeMinimis: taxDutyResult.taxDeMinimis,
        incoterm: taxDutyResult.incoterm,
        provenance: taxDutyResult.provenance
      },
      totals: {
        subtotal: Number(subtotalMoney.toDecimalString()),
        subtotalExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(subtotalMoney)),
        discount: Number(discountMoney.toDecimalString()),
        discountExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(discountMoney)),
        shipping: Number(selectedShippingMoney.toDecimalString()),
        shippingExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(selectedShippingMoney)),
        tax: Number(taxMoney.toDecimalString()),
        taxExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(taxMoney)),
        additionalTax: Number(additionalTaxMoney.toDecimalString()),
        additionalTaxExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(additionalTaxMoney)),
        taxIncluded: Number(taxIncludedMoney.toDecimalString()),
        taxIncludedExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(taxIncludedMoney)),
        duties: Number(payableDutiesMoney.toDecimalString()),
        dutiesExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(payableDutiesMoney)),
        estimatedDuties: Number(estimatedDutiesMoney.toDecimalString()),
        estimatedDutiesExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(estimatedDutiesMoney)),
        landedCost: Number(landedCostMoney.toDecimalString()),
        landedCostExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(landedCostMoney)),
        grandTotal: Number(grandTotalMoney.toDecimalString()),
        grandTotalExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(grandTotalMoney))
      },
      eligiblePaymentMethods: eligiblePaymentMethods.map((m) => ({
        code: m.code,
        displayName: m.displayName,
        paymentType: m.paymentType,
        isPrepaid: m.paymentType !== 'offline' && m.code !== 'cod'
      })),
      issuedAt,
      expiresAt
    };

    const signable = this.buildSignablePayload({
      ...quoteData,
      shippingServiceLevel: selectedShippingOption.serviceLevel
    });

    const quoteSignature = crypto
      .createHmac('sha256', getCheckoutQuoteSecret())
      .update(JSON.stringify(signable))
      .digest('hex');

    const quoteEnvelope = {
      ...signable,
      quoteSignature
    };

    return {
      ...quoteData,
      quoteToken: Buffer.from(JSON.stringify(quoteEnvelope)).toString('base64url')
    };
  }

  /**
   * Authoritatively verifies and decodes a base64url signed quote token.
   * Enforces token structure, key version, expiry, future-dated clock skew, and HMAC-SHA256 signature.
   * @param {string} quoteToken
   * @returns {Object} Decoded verified signable quote payload
   */
  verifyAndDecodeQuoteToken(quoteToken) {
    if (!quoteToken || typeof quoteToken !== 'string') {
      throw new AppError('Quote token is required', 400, 'QUOTE_REQUIRED');
    }

    if (quoteToken.length > 32768) {
      throw new AppError('Quote token exceeds maximum allowed size', 400, 'QUOTE_MALFORMED');
    }

    let envelope;
    try {
      const decoded = Buffer.from(quoteToken, 'base64url').toString('utf8');
      envelope = JSON.parse(decoded);
    } catch {
      throw new AppError('Malformed checkout quote token', 400, 'QUOTE_MALFORMED');
    }

    if (!envelope || typeof envelope !== 'object') {
      throw new AppError('Malformed checkout quote token', 400, 'QUOTE_MALFORMED');
    }

    if (envelope.kid !== 'v1' && envelope.kid !== CURRENT_QUOTE_KEY_ID) {
      throw new AppError('Unsupported quote token key version', 409, 'QUOTE_VERSION_UNSUPPORTED');
    }

    if (!envelope.quoteId || !envelope.issuedAt || !envelope.expiresAt || !envelope.quoteSignature) {
      throw new AppError('Quote token is missing required envelope fields', 400, 'QUOTE_INVALID');
    }

    const now = Date.now();
    const issuedTime = new Date(envelope.issuedAt).getTime();
    const expiresTime = new Date(envelope.expiresAt).getTime();

    if (Number.isNaN(issuedTime) || Number.isNaN(expiresTime)) {
      throw new AppError('Invalid timestamp in quote token', 400, 'QUOTE_INVALID');
    }

    // Future-dated check (allow 60s clock skew)
    if (issuedTime > now + 60000) {
      throw new AppError('Quote token issued in future (clock skew)', 409, 'QUOTE_FUTURE_DATED');
    }

    // Expired check
    if (now > expiresTime) {
      throw new AppError('Checkout quote has expired. Please refresh checkout.', 409, 'QUOTE_EXPIRED');
    }

    const { quoteSignature, ...signable } = envelope;
    const expectedSignature = crypto
      .createHmac('sha256', getCheckoutQuoteSecret())
      .update(JSON.stringify(signable))
      .digest('hex');

    if (!safeCompareSignatures(quoteSignature, expectedSignature)) {
      throw new AppError('Checkout quote signature is invalid or tampered', 409, 'QUOTE_TAMPERED');
    }

    return envelope;
  }

  /**
   * Validate and verify that a quote object and token are genuine, non-expired, and consistent.
   * @param {Object} quote
   * @returns {boolean}
   */
  verifyQuoteIntegrity(quote) {
    if (!quote || typeof quote !== 'object') {
      throw new AppError('Invalid quote format', 400, 'QUOTE_INVALID');
    }

    const token = quote.quoteToken;
    if (!token) {
      throw new AppError('Quote token is missing', 400, 'QUOTE_UNVERIFIED');
    }

    const decoded = this.verifyAndDecodeQuoteToken(token);

    if (quote.quoteId && quote.quoteId !== decoded.quoteId) {
      throw new AppError('Quote identifier mismatch between payload and signed token', 409, 'QUOTE_TAMPERED');
    }

    // Verify consistency between display numbers and exact minor representation
    if (quote.totals?.grandTotalExact && quote.totals.grandTotal !== undefined) {
      const gte = quote.totals.grandTotalExact;
      const rawMinor = gte.amountMinor !== undefined ? gte.amountMinor : gte;
      const minorStr = rawMinor && typeof rawMinor === 'object' && rawMinor.$numberDecimal
        ? String(rawMinor.$numberDecimal)
        : String(rawMinor || '0');
      const exp = gte.exponent !== undefined ? Number(gte.exponent) : 2;
      const expectedDecimal = (Number(minorStr) / (10 ** exp));
      if (Math.abs(expectedDecimal - Number(quote.totals.grandTotal)) > 0.0001) {
        throw new AppError('Checkout quote totals mismatch exact representation', 409, 'QUOTE_TAMPERED');
      }
      if (decoded.grandTotalMinor !== minorStr) {
        throw new AppError('Checkout quote grand total does not match signed token', 409, 'QUOTE_TAMPERED');
      }
    }

    return true;
  }

  normalizePostalCode(postalCode) {
    return CheckoutQuoteService.normalizePostalCode(postalCode);
  }

  hashPostalCode(shippingAddress) {
    return CheckoutQuoteService.hashPostalCode(shippingAddress);
  }
}

const defaultInstance = new CheckoutQuoteService();
defaultInstance.CheckoutQuoteService = CheckoutQuoteService;
defaultInstance.normalizePostalCode = CheckoutQuoteService.normalizePostalCode;
defaultInstance.hashPostalCode = CheckoutQuoteService.hashPostalCode;
defaultInstance.hashItems = CheckoutQuoteService.hashItems;

module.exports = defaultInstance;
module.exports.CheckoutQuoteService = CheckoutQuoteService;

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
    commerceConfigService = CommerceConfigurationService
  } = {}) {
    this.marketService = marketService;
    this.taxEngine = taxEngine;
    this.shippingRegistry = shippingRegistry;
    this.paymentPolicy = paymentPolicy;
    this.commerceConfigService = commerceConfigService;
  }

  /**
   * Computes deterministic SHA-256 hash of ordered items and prices.
   * @param {Array<Object>} items
   * @returns {string}
   */
  hashItems(items) {
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

    const destinationCountry = quotePayload.destination?.countryCode || quotePayload.destinationCountry || '';

    return {
      kid: quotePayload.kid || CURRENT_QUOTE_KEY_ID,
      quoteId: quotePayload.quoteId,
      merchantScopeId: quotePayload.merchantScopeId || 'default',
      configVersionId: quotePayload.configVersionId || 'v1',
      merchantCountry: quotePayload.merchantCountry,
      fulfillmentOriginCountry: quotePayload.fulfillmentOriginCountry || quotePayload.merchantCountry,
      destinationCountry,
      currency: quotePayload.currency,
      itemsHash: quotePayload.itemsHash,
      subtotalMinor: quotePayload.subtotalMinor || getMinorStr(quotePayload.totals?.subtotalExact),
      discountMinor: quotePayload.discountMinor || getMinorStr(quotePayload.totals?.discountExact),
      shippingMinor: quotePayload.shippingMinor || getMinorStr(quotePayload.totals?.shippingExact),
      taxMinor: quotePayload.taxMinor || getMinorStr(quotePayload.totals?.taxExact),
      dutyMinor: quotePayload.dutyMinor || getMinorStr(quotePayload.totals?.dutiesExact),
      grandTotalMinor: quotePayload.grandTotalMinor || getMinorStr(quotePayload.totals?.grandTotalExact),
      incoterm: quotePayload.incoterm || 'DOMESTIC',
      shippingServiceLevel: quotePayload.shippingServiceLevel || quotePayload.shipping?.selectedOption?.serviceLevel || 'standard',
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

      // Check stock availability
      const availableStock = variant ? variant.stock : product.stock;
      if (availableStock < quantity) {
        throw new AppError(
          `Insufficient stock for '${product.name}${variant ? ` (${variant.sku || 'variant'})` : ''}'. Requested: ${quantity}, Available: ${availableStock}`,
          409,
          'INSUFFICIENT_STOCK'
        );
      }

      let unitPriceMoney;
      let offering = null;
      let priceBookEntry = null;

      if (destinationCountry) {
        const now = new Date();
        offering = await ProductMarketOffering.findOne({
          merchantScopeId,
          productId: product._id,
          variantId: variant ? variant._id : null,
          marketCountry: destinationCountry,
          status: 'active',
          visibility: 'visible',
          effectiveFrom: { $lte: now },
          $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
        }).session(session);

        if (!offering && variant) {
          offering = await ProductMarketOffering.findOne({
            merchantScopeId,
            productId: product._id,
            variantId: null,
            marketCountry: destinationCountry,
            status: 'active',
            visibility: 'visible',
            effectiveFrom: { $lte: now },
            $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
          }).session(session);
        }

        priceBookEntry = await MarketPriceBook.findOne({
          merchantScopeId,
          productId: product._id,
          variantId: variant ? variant._id : null,
          marketCountry: destinationCountry,
          currency,
          status: 'active',
          effectiveFrom: { $lte: now },
          $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
        }).session(session);

        if (!priceBookEntry && variant) {
          priceBookEntry = await MarketPriceBook.findOne({
            merchantScopeId,
            productId: product._id,
            variantId: null,
            marketCountry: destinationCountry,
            currency,
            status: 'active',
            effectiveFrom: { $lte: now },
            $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
          }).session(session);
        }
      }

      if (priceBookEntry) {
        unitPriceMoney = Money.fromMinor(priceBookEntry.amountMinor, currency);
      } else {
        const rawPrice = variant
          ? (variant.salePrice > 0 ? variant.salePrice : variant.price)
          : product.price;

        if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
          throw new AppError(`Product '${product.name}' has an invalid price`, 409, ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE);
        }
        unitPriceMoney = Money.fromLegacyNumber(rawPrice, currency);
      }

      const lineTotalMoney = unitPriceMoney.multiplyRational(quantity, 1);

      // Logistics & Customs Resolution
      const weightGrams = variant?.weightGrams || product.weightGrams
        || (variant?.weight ? Math.round(variant.weight * 1000) : (product.weight ? Math.round(product.weight * 1000) : 500));

      const dangerousGoodsClassification = variant?.dangerousGoodsClassification
        || product.dangerousGoodsClassification
        || 'UNKNOWN';

      const declaredValueEligibility = variant?.declaredValueEligibility
        || product.declaredValueEligibility
        || 'UNKNOWN';

      const hsCode = variant?.hsClassification?.code || product.hsClassification?.code || null;
      const countryOfOrigin = product.countryOfOrigin || 'PK';

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
        weightKg: (weightGrams * quantity) / 1000,
        dangerousGoodsClassification,
        declaredValueEligibility,
        hsCode,
        countryOfOrigin,
        image: variant?.images?.[0] || product.primaryImage || product.images?.[0] || product.image || '',
        offeringId: offering ? String(offering._id) : null,
        offeringLockVersion: offering ? offering.lockVersion : null,
        priceBookEntryId: priceBookEntry ? String(priceBookEntry._id) : null,
        priceBookLockVersion: priceBookEntry ? priceBookEntry.lockVersion : null,
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
    const merchantCountry = (market.merchantCountry || market.homeCountry || 'PK').toUpperCase();
    const fulfillmentOrigin = (market.fulfillmentOriginCountry || merchantCountry).toUpperCase();

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
    const targetCurrency = (currency || market.defaultCurrency || market.baseCurrency || 'PKR').toUpperCase();
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
        if (it.dangerousGoodsClassification === 'UNKNOWN' || it.dangerousGoodsClassification === 'UNCLASSIFIED') {
          throw new AppError(
            `Product '${it.name}' has unclassified dangerous goods status and cannot be quoted for international shipping`,
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
        if (!it.countryOfOrigin) {
          throw new AppError(
            `Product '${it.name}' is missing country of origin for international shipping`,
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

    // 6. Multi-Service Shipping Quoting via Active Version Rules
    const shippingRules = activeConfigDoc?.shippingRules || null;
    const adapter = this.shippingRegistry.get(shippingAdapter);

    const shippingStandard = await adapter.quote({
      countryCode: destinationCountry,
      currency: targetCurrency,
      subtotalMoney: afterDiscountMoney,
      city: normalizedAddress.locality,
      region: normalizedAddress.administrativeArea,
      postalCode: normalizedAddress.postalCode,
      weightGrams: totalWeightGrams,
      serviceLevel: 'standard',
      shippingRules,
      configVersionId
    });

    let shippingExpress = null;
    try {
      shippingExpress = await adapter.quote({
        countryCode: destinationCountry,
        currency: targetCurrency,
        subtotalMoney: afterDiscountMoney,
        city: normalizedAddress.locality,
        region: normalizedAddress.administrativeArea,
        postalCode: normalizedAddress.postalCode,
        weightGrams: totalWeightGrams,
        serviceLevel: 'express',
        shippingRules,
        configVersionId
      });
    } catch {
      // Express might not be supported for all zones
    }

    const selectedShippingOption = shippingServiceLevel === 'express' && shippingExpress
      ? shippingExpress
      : shippingStandard;

    let selectedShippingMoney = freeShippingCoupon && shippingServiceLevel === 'standard'
      ? Money.zero(targetCurrency)
      : MoneyMapper.toMoney(selectedShippingOption.shippingAmountExact);

    // 7. Calculate Tax & Duties with Landed-Cost Provenance via Active Version Rules
    const taxRules = activeConfigDoc?.taxRules || null;
    const taxDutyResult = this.taxEngine.calculate({
      destinationCountry,
      originCountry: fulfillmentOrigin,
      administrativeArea: normalizedAddress.administrativeArea,
      taxableSubtotal: afterDiscountMoney,
      shippingAmount: selectedShippingMoney,
      currency: targetCurrency,
      taxRules,
      configVersionId
    });

    const taxMoney = MoneyMapper.toMoney(taxDutyResult.taxAmountExact);
    const dutiesMoney = MoneyMapper.toMoney(taxDutyResult.dutyAmountExact);

    // 8. Deterministic Exact Grand Total
    // DDP: subtotal - discount + shipping + tax + duties (seller collects import duties)
    // DAP / DOMESTIC: subtotal - discount + shipping + tax (duties unpaid at checkout, collected at destination)
    const payableDutiesMoney = taxDutyResult.incoterm === 'DDP' ? dutiesMoney : Money.zero(targetCurrency);
    const grandTotalMoney = subtotalMoney
      .subtract(discountMoney)
      .add(selectedShippingMoney)
      .add(taxMoney)
      .add(payableDutiesMoney);

    // 9. Payment Method Eligibility Synthesis
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

    const now = new Date();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + QUOTE_TTL_SECONDS * 1000).toISOString();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const entropy = crypto.randomBytes(6).toString('hex').toUpperCase();
    const quoteId = `QUO-${dateStr}-${entropy}`;

    const itemsHash = this.hashItems(pricedItems);

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
          freeShippingApplied: freeShippingCoupon || selectedShippingOption.freeShippingApplied,
          isRemote: selectedShippingOption.isRemote,
          deliveryEstimate: selectedShippingOption.deliveryEstimate
        },
        availableOptions: [
          shippingStandard,
          ...(shippingExpress ? [shippingExpress] : [])
        ].map((opt) => ({
          serviceLevel: opt.serviceLevel,
          amount: opt.serviceLevel === 'standard' && freeShippingCoupon ? 0 : opt.shippingAmount,
          amountExact: opt.serviceLevel === 'standard' && freeShippingCoupon
            ? MoneyMapper.toJSON(MoneyMapper.toPersistence(Money.zero(targetCurrency)))
            : MoneyMapper.toJSON(opt.shippingAmountExact),
          deliveryEstimate: opt.deliveryEstimate
        }))
      },
      taxesAndDuties: {
        taxType: taxDutyResult.taxType,
        taxRatePercent: taxDutyResult.taxRatePercent,
        taxAmount: taxDutyResult.taxAmount,
        taxAmountExact: MoneyMapper.toJSON(taxDutyResult.taxAmountExact),
        dutyRatePercent: taxDutyResult.dutyRatePercent,
        dutyAmount: taxDutyResult.dutyAmount,
        dutyAmountExact: MoneyMapper.toJSON(taxDutyResult.dutyAmountExact),
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
        duties: Number(payableDutiesMoney.toDecimalString()),
        dutiesExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(payableDutiesMoney)),
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

    if (quoteToken.length > 4096) {
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
}

module.exports = new CheckoutQuoteService();
module.exports.CheckoutQuoteService = CheckoutQuoteService;

/**
 * @file CheckoutQuoteService.js
 * @description Canonical Global Checkout Eligibility and Quote Orchestration Service.
 * Implements atomic quote generation, seller/destination resolution, multi-service shipping,
 * exact-money tax/duties landed-cost calculation, and stale/tamper quote protection.
 */

const crypto = require('crypto');
const MarketService = require('../MarketService');
const Product = require('../../models/Product');
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
const QUOTE_SIGNING_SECRET = process.env.QUOTE_SECRET || process.env.JWT_SECRET || 'mevapur-deterministic-quote-seal-key-2026';

class CheckoutQuoteService {
  constructor({
    marketService = MarketService,
    taxEngine = TaxDutyEngine,
    shippingRegistry = shippingAdapterRegistry,
    paymentPolicy = defaultPaymentPolicy
  } = {}) {
    this.marketService = marketService;
    this.taxEngine = taxEngine;
    this.shippingRegistry = shippingRegistry;
    this.paymentPolicy = paymentPolicy;
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
   * Generates a tamper-proof cryptographic signature for a quote payload.
   * @param {Object} quotePayload
   * @returns {string}
   */
  signQuote(quotePayload) {
    const getMinorStr = (exactObj) => {
      if (!exactObj) return '0';
      const raw = exactObj.amountMinor !== undefined ? exactObj.amountMinor : exactObj;
      if (raw && typeof raw === 'object' && raw.$numberDecimal) return String(raw.$numberDecimal);
      if (raw && typeof raw === 'object' && typeof raw.toString === 'function') return raw.toString();
      return String(raw || '0');
    };

    const destinationCountry = quotePayload.destination?.countryCode || quotePayload.destinationCountry || '';

    const signable = {
      quoteId: quotePayload.quoteId,
      merchantCountry: quotePayload.merchantCountry,
      destinationCountry,
      currency: quotePayload.currency,
      itemsHash: quotePayload.itemsHash,
      grandTotalMinor: getMinorStr(quotePayload.totals?.grandTotalExact),
      shippingAmountMinor: getMinorStr(quotePayload.totals?.shippingExact),
      taxAmountMinor: getMinorStr(quotePayload.totals?.taxExact),
      dutyAmountMinor: getMinorStr(quotePayload.totals?.dutiesExact),
      issuedAt: quotePayload.issuedAt,
      expiresAt: quotePayload.expiresAt
    };

    return crypto
      .createHmac('sha256', QUOTE_SIGNING_SECRET)
      .update(JSON.stringify(signable))
      .digest('hex');
  }

  /**
   * Resolves and validates cart items, calculating exact unit prices and line totals.
   * @param {Array<Object>} items
   * @param {string} currency
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>}
   */
  async resolvePricedItems(items, currency, { session = null } = {}) {
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

      const rawPrice = variant
        ? (variant.salePrice > 0 ? variant.salePrice : variant.price)
        : product.price;

      if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
        throw new AppError(`Product '${product.name}' has an invalid price`, 409, ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE);
      }

      const unitPriceMoney = Money.fromLegacyNumber(rawPrice, currency);
      const lineTotalMoney = unitPriceMoney.multiplyRational(quantity, 1);

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
        weightKg: Number(product.weight || 0) * quantity,
        image: variant?.images?.[0] || product.primaryImage || product.images?.[0] || product.image || ''
      });
    }

    return resolved;
  }

  /**
   * Generate an Authoritative Checkout Quote.
   * @param {Object} params
   * @param {string} [params.userId]
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
    items,
    shippingAddress,
    currency = null,
    couponCode = null,
    shippingServiceLevel = 'standard',
    shippingAdapter = null
  }) {
    // 1. Authoritative Seller & Market Context
    const market = await this.marketService.getConfig();
    if (!market || !market.isEnabled) {
      throw new AppError('Market configuration is currently disabled', 503, 'MARKET_DISABLED');
    }

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
      currency: targetCurrency
    });

    // 4. Resolve Items & Subtotal
    const pricedItems = await this.resolvePricedItems(items, targetCurrency);
    const subtotalMoney = pricedItems.reduce(
      (sum, item) => sum.add(MoneyMapper.toMoney(item.lineTotalExact)),
      Money.zero(targetCurrency)
    );
    const totalWeightKg = pricedItems.reduce((sum, item) => sum + (item.weightKg || 0), 0);

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

    // 6. Multi-Service Shipping Quoting
    const adapter = this.shippingRegistry.get(shippingAdapter);
    const shippingStandard = await adapter.quote({
      countryCode: destinationCountry,
      currency: targetCurrency,
      subtotalMoney: afterDiscountMoney,
      city: normalizedAddress.locality,
      region: normalizedAddress.administrativeArea,
      postalCode: normalizedAddress.postalCode,
      weightKg: totalWeightKg,
      serviceLevel: 'standard'
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
        weightKg: totalWeightKg,
        serviceLevel: 'express'
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

    // 7. Calculate Tax & Duties with Landed-Cost Provenance
    const taxDutyResult = this.taxEngine.calculate({
      destinationCountry,
      originCountry: fulfillmentOrigin,
      administrativeArea: normalizedAddress.administrativeArea,
      taxableSubtotal: afterDiscountMoney,
      shippingAmount: selectedShippingMoney,
      currency: targetCurrency
    });

    const taxMoney = MoneyMapper.toMoney(taxDutyResult.taxAmountExact);
    const dutiesMoney = MoneyMapper.toMoney(taxDutyResult.dutyAmountExact);

    // 8. Deterministic Exact Grand Total
    // Formula: subtotal - discount + shipping + tax + duties
    const grandTotalMoney = subtotalMoney
      .subtract(discountMoney)
      .add(selectedShippingMoney)
      .add(taxMoney)
      .add(dutiesMoney);

    // 9. Payment Method Eligibility Synthesis
    const isDomestic = destinationCountry === merchantCountry;
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
      quoteId,
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
          zoneId: selectedShippingOption.zoneId,
          zoneName: selectedShippingOption.zoneName,
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
        duties: Number(dutiesMoney.toDecimalString()),
        dutiesExact: MoneyMapper.toJSON(MoneyMapper.toPersistence(dutiesMoney)),
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

    const quoteSignature = this.signQuote(quoteData);

    return {
      ...quoteData,
      quoteToken: Buffer.from(JSON.stringify({
        quoteId,
        quoteSignature,
        issuedAt,
        expiresAt
      })).toString('base64url')
    };
  }

  /**
   * Validate and verify that a quote token is genuine, non-expired, and matches current state.
   * @param {Object} quote
   * @returns {boolean}
   */
  verifyQuoteIntegrity(quote) {
    if (!quote || !quote.quoteId || !quote.issuedAt || !quote.expiresAt) {
      throw new AppError('Invalid quote format', 400, 'QUOTE_INVALID');
    }

    const now = new Date();
    const expiry = new Date(quote.expiresAt);
    if (now > expiry) {
      throw new AppError('Checkout quote has expired. Please refresh checkout.', 409, 'QUOTE_EXPIRED');
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
    }

    const expectedSignature = this.signQuote(quote);
    if (!quote.quoteToken) {
      throw new AppError('Quote token is missing', 400, 'QUOTE_UNVERIFIED');
    }

    let parsedToken;
    try {
      parsedToken = JSON.parse(Buffer.from(quote.quoteToken, 'base64url').toString('utf8'));
    } catch {
      throw new AppError('Malformed quote token', 400, 'QUOTE_MALFORMED');
    }

    if (parsedToken.quoteSignature !== expectedSignature || parsedToken.quoteId !== quote.quoteId) {
      throw new AppError('Checkout quote signature is invalid or tampered', 409, 'QUOTE_TAMPERED');
    }

    return true;
  }
}

module.exports = new CheckoutQuoteService();
module.exports.CheckoutQuoteService = CheckoutQuoteService;

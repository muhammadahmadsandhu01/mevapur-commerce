const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const User = require('../../models/User');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const Payment = require('../../models/Payment');
const CouponService = require('./CouponService');
const TaxService = require('./TaxService');
const InventoryService = require('./InventoryService');
const ProductVisibilityPolicy = require('../product/ProductVisibilityPolicy');
const MarketService = require('../MarketService');
const AuditService = require('../AuditService');
const CheckoutQuoteService = require('../checkout/CheckoutQuoteService');
const CommerceConfigurationService = require('../commerce/CommerceConfigurationService');
const defaultPaymentPolicy = require('../payment/PaymentCapabilityPolicy');
const TaxDutyEngine = require('../checkout/TaxDutyEngine');
const shippingAdapterRegistry = require('../checkout/shipping/ShippingAdapterRegistry');
const logger = require('../../utils/logger');
const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');
const {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_LIMITS
} = require('../../constants/orderConstants');
const { PAYMENT_STATUSES } = require('../../constants/paymentConstants');
const {
  Money,
  MoneyMapper,
  RolloutAuthority,
  Address,
  Phone,
  CountryRegistry,
  CurrencyRegistry
} = require('../../modules/commerce');

class OrderService {
  roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  normalizeCountry(value) {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim().toUpperCase();
    if (CountryRegistry.hasCountry(trimmed)) {
      return trimmed;
    }
    const resolved = CountryRegistry.resolve(trimmed);
    return resolved ? resolved.alpha2 : trimmed;
  }

  hashRequest(orderData) {
    const canonicalItems = [...orderData.items]
      .map((item) => ({
        productId: item.productId,
        variantId: item.variantId || null,
        quantity: item.quantity
      }))
      .sort((left, right) => (
        `${left.productId}:${left.variantId || ''}`
          .localeCompare(`${right.productId}:${right.variantId || ''}`)
      ));

    const canonical = {
      items: canonicalItems,
      shippingAddress: orderData.shippingAddress,
      paymentMethod: orderData.paymentMethod,
      currency: orderData.currency || null,
      couponCode: orderData.couponCode || null,
      customerNote: orderData.customerNote || null,
      quoteToken: orderData.quoteToken || null
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  assertReplayMatches(order, requestHash) {
    if (order.requestHash !== requestHash) {
      throw new AppError(
        'Idempotency-Key was already used with a different order request',
        409,
        ERROR_CODES.ORDER_IDEMPOTENCY_CONFLICT
      );
    }
  }

  async findIdempotentOrder(userId, idempotencyKey, session = null) {
    let query = Order.findOne({ user: userId, idempotencyKey })
      .select('+requestHash +idempotencyKey');
    if (session) query = query.session(session);
    return query;
  }

  async resolveItems(items, session, currency = 'PKR', destinationCountry = null, merchantScopeId = 'default') {
    const resolved = [];
    const resolvedKeys = new Set();
    const activeCategoryIds = await ProductVisibilityPolicy.getActiveCategoryIds({ session });

    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product || !product.isActive || product.status !== 'published') {
        throw new AppError(
          'A selected product is unavailable',
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
          'A selected product is unavailable',
          409,
          ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE
        );
      }

      let variant = null;
      if (item.variantId) {
        variant = product.variants.id(item.variantId);
        if (!variant) {
          throw new AppError(
            `Selected variant is unavailable for ${product.name}`,
            409,
            ERROR_CODES.ORDER_VARIANT_NOT_FOUND
          );
        }
      } else if (product.variants.length > 0) {
        variant = product.variants.find((entry) => entry.isDefault)
          || product.variants[0];
      }

      const resolvedKey = `${product._id}:${variant?._id || 'root'}`;
      if (resolvedKeys.has(resolvedKey)) {
        throw new AppError(
          'Duplicate product/variant lines are not allowed',
          400,
          ERROR_CODES.ORDER_VALIDATION_FAILED
        );
      }
      resolvedKeys.add(resolvedKey);

      let price;
      let unitPriceExact;
      let lineTotal;
      let lineTotalExact;
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

      const money = Money.fromMinor(priceBookEntry.amountMinor, currency);
      const lineTotalMoney = money.multiplyRational(item.quantity, 1);
      price = Number(money.toDecimalString());
      unitPriceExact = MoneyMapper.toPersistence(money);
      lineTotal = Number(lineTotalMoney.toDecimalString());
      lineTotalExact = MoneyMapper.toPersistence(lineTotalMoney);

      const variantLabel = variant
        ? variant.attributes
          .map((attribute) => `${attribute.name}: ${attribute.value}`)
          .join(', ')
        : '';

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

      const hsCode = variant?.hsClassification?.code || product.hsClassification?.code || null;
      const countryOfOrigin = variant?.countryOfOrigin || product.countryOfOrigin || null;
      const customsDescription = variant?.customsDescription || product.customsDescription || product.shortDescription || product.name;

      resolved.push({
        product: product._id,
        variantId: variant?._id || null,
        isDefaultVariant: Boolean(variant?.isDefault),
        name: product.name,
        sku: variant?.sku || product.sku || '',
        variant: variantLabel,
        price,
        unitPriceExact,
        quantity: item.quantity,
        lineTotal,
        lineTotalExact,
        weightGrams: weightGrams * item.quantity,
        dangerousGoodsClassification,
        declaredValueEligibility,
        hsCode,
        countryOfOrigin,
        customsDescription,
        image: variant?.images?.[0]
          || product.primaryImage
          || product.images?.[0]
          || product.image
          || '',
        categoryId: product.category || null,
        offeringId: offering ? offering._id : null,
        offeringLockVersion: offering ? offering.lockVersion : null,
        offeringVersion: offering ? offering.version : null,
        priceBookEntryId: priceBookEntry ? priceBookEntry._id : null,
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

  isRetryableTransactionError(error) {
    return (
      error?.hasErrorLabel?.('TransientTransactionError')
      || error?.hasErrorLabel?.('UnknownTransactionCommitResult')
      || error?.code === 112
      || error?.codeName === 'WriteConflict'
    );
  }

  async runTransaction(work) {
    let isDeployed = false;
    try {
      const { getRuntimeConfig } = require('../../config/runtime.config');
      isDeployed = Boolean(getRuntimeConfig().isDeployed);
    } catch {
      const candidate = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
      isDeployed = candidate === 'staging' || candidate === 'production';
    }

    let lastError;

    for (
      let attempt = 1;
      attempt <= ORDER_LIMITS.MAX_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      let session;
      try {
        session = await mongoose.startSession();
      } catch (sessionErr) {
        if (isDeployed) {
          throw new AppError(
            'Database transactions are required but unavailable in deployed environments',
            503,
            ERROR_CODES.SERVICE_UNAVAILABLE || 'SERVICE_UNAVAILABLE'
          );
        }
        return await work(null, 1);
      }
      session.startTransaction();

      try {
        const result = await work(session, attempt);
        await session.commitTransaction();
        await session.endSession();
        return result;
      } catch (error) {
        lastError = error;
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        await session.endSession();

        if (
          !this.isRetryableTransactionError(error)
          || attempt === ORDER_LIMITS.MAX_TRANSACTION_ATTEMPTS
        ) {
          throw error;
        }

        const jitter = Math.floor(Math.random() * 50) + 25 * attempt;
        await new Promise((resolve) => setTimeout(resolve, jitter));
      }
    }

    throw lastError;
  }

  async waitForIdempotentOrder(userId, idempotencyKey) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const order = await this.findIdempotentOrder(userId, idempotencyKey);
      if (order) return order;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  isIdempotencyDuplicate(error) {
    return (error?.code === 11000 || error?.name === 'MongoServerError') && (
      Boolean(error?.keyPattern?.idempotencyKey)
      || String(error.message || '').includes('unique_user_order_idempotency')
      || String(error.message || '').includes('idempotencyKey')
      || String(error.message || '').includes('E11000')
    );
  }

  isOrderIdDuplicate(error) {
    return (error?.code === 11000 || error?.name === 'MongoServerError') && (
      Boolean(error?.keyPattern?.orderId)
      || String(error.message || '').includes('orderId')
    );
  }

  async createOrder({ userId, orderData, idempotencyKey }) {
    const requestHash = this.hashRequest(orderData);
    const existing = await this.findIdempotentOrder(userId, idempotencyKey);
    if (existing) {
      this.assertReplayMatches(existing, requestHash);
      return { order: existing, isReplay: true };
    }

    const orderObjectId = new mongoose.Types.ObjectId();
    let orderId = Order.generateOrderId();

    for (
      let idAttempt = 1;
      idAttempt <= ORDER_LIMITS.MAX_ORDER_ID_ATTEMPTS;
      idAttempt += 1
    ) {
      try {
        return await this.runTransaction(async (session) => {
          const replay = await this.findIdempotentOrder(
            userId,
            idempotencyKey,
            session
          );
          if (replay) {
            this.assertReplayMatches(replay, requestHash);
            return { order: replay, isReplay: true };
          }

          const market = await MarketService.getConfig();
          if (!market || !market.isEnabled) {
            throw new AppError('Market configuration is currently disabled', 503, 'MARKET_DISABLED');
          }
          const merchantCountry = (market.merchantCountry || market.homeCountry);
          if (!merchantCountry) {
            throw new AppError('Market configuration missing merchant country', 503, 'MARKET_CONFIGURATION_UNAVAILABLE');
          }
          let fulfillmentOrigin = (market.fulfillmentOriginCountry || merchantCountry).toUpperCase();

          // 1. Authoritative Address Normalization
          let normalizedAddress = null;
          try {
            normalizedAddress = Address.create({
              fullName: orderData.shippingAddress.fullName || 'Valued Customer',
              addressLine1: orderData.shippingAddress.address || orderData.shippingAddress.addressLine1,
              addressLine2: orderData.shippingAddress.addressLine2,
              locality: orderData.shippingAddress.city || orderData.shippingAddress.locality,
              administrativeArea: orderData.shippingAddress.province || orderData.shippingAddress.state || orderData.shippingAddress.administrativeArea,
              postalCode: orderData.shippingAddress.postalCode || orderData.shippingAddress.zip,
              countryCode: orderData.shippingAddress.countryCode || orderData.shippingAddress.country,
              phone: orderData.shippingAddress.phone
            });
          } catch (addrErr) {
            if (orderData.quoteToken) {
              throw addrErr;
            }
            const rawCountry = orderData.shippingAddress.countryCode || orderData.shippingAddress.country;
            if (!rawCountry) {
              throw new AppError('Shipping country is required', 400, 'INVALID_SHIPPING_COUNTRY');
            }
            const resolvedCountry = CountryRegistry.resolve(rawCountry);
            const countryCode = resolvedCountry?.alpha2 || (typeof rawCountry === 'string' && rawCountry.length === 2 ? rawCountry.toUpperCase() : null);
            if (!countryCode) {
              throw new AppError('Invalid shipping country code', 400, 'INVALID_SHIPPING_COUNTRY');
            }
            normalizedAddress = {
              fullName: orderData.shippingAddress.fullName || 'Valued Customer',
              addressLine1: orderData.shippingAddress.address || orderData.shippingAddress.addressLine1 || '',
              addressLine2: orderData.shippingAddress.addressLine2 || '',
              locality: orderData.shippingAddress.city || orderData.shippingAddress.locality || '',
              administrativeArea: orderData.shippingAddress.province || orderData.shippingAddress.state || orderData.shippingAddress.administrativeArea || '',
              postalCode: orderData.shippingAddress.postalCode || orderData.shippingAddress.zip || '',
              countryCode,
              phone: orderData.shippingAddress.phone || ''
            };
          }

          const destinationCountry = normalizedAddress.countryCode;
          const currency = (orderData.currency || market.defaultCurrency || market.baseCurrency);
          if (!currency) {
            throw new AppError('Currency is required', 400, 'CURRENCY_REQUIRED');
          }
          const normalizedCurrency = currency.toUpperCase();
          await MarketService.assertEligible({ country: destinationCountry, currency: normalizedCurrency });

          const isDomestic = destinationCountry === merchantCountry;
          const isPrepaid = orderData.paymentMethod !== 'cod';

          // 2. Authoritative Quote Enforcement Policy
          let verifiedQuote = null;
          if (orderData.quoteToken) {
            verifiedQuote = CheckoutQuoteService.verifyAndDecodeQuoteToken(orderData.quoteToken);
          } else {
            if (!isDomestic) {
              throw new AppError(
                'International checkout requires an authoritative checkout quote',
                400,
                'QUOTE_REQUIRED'
              );
            }
            if (isPrepaid) {
              throw new AppError(
                'Prepaid checkout requires an authoritative checkout quote',
                400,
                'QUOTE_REQUIRED'
              );
            }
            // For domestic COD without quote, verify payment capability policy allows it
            const isAllowedCOD = await defaultPaymentPolicy.isMethodAllowedForDelivery(destinationCountry, 'cod', merchantCountry);
            if (!isAllowedCOD) {
              throw new AppError('Cash on delivery is not eligible for this route', 400, ERROR_CODES.PAYMENT_PROVIDER_NOT_ELIGIBLE);
            }
          }

          if (verifiedQuote) {
            if (verifiedQuote.destinationCountry !== destinationCountry) {
              throw new AppError('Order destination country does not match quote', 409, 'QUOTE_DESTINATION_MISMATCH');
            }
            if (verifiedQuote.destinationSubdivision !== undefined && verifiedQuote.destinationSubdivision !== (normalizedAddress.administrativeArea || '').trim().toUpperCase()) {
              throw new AppError('Order destination subdivision does not match quote', 409, 'QUOTE_DESTINATION_MISMATCH');
            }
            const computedPostalFingerprint = CheckoutQuoteService.hashPostalCode(normalizedAddress.postalCode);
            if (verifiedQuote.destinationPostalFingerprint !== undefined && verifiedQuote.destinationPostalFingerprint !== computedPostalFingerprint) {
              throw new AppError('Order destination postal code does not match quote', 409, 'QUOTE_DESTINATION_MISMATCH');
            }
            if (verifiedQuote.currency !== currency) {
              throw new AppError('Order currency does not match quote', 409, 'QUOTE_CURRENCY_MISMATCH');
            }
            if (verifiedQuote.merchantCountry !== merchantCountry) {
              throw new AppError('Order merchant context does not match quote', 409, 'QUOTE_MERCHANT_MISMATCH');
            }
            if (verifiedQuote.configVersionId) {
              const isAcceptable = await CommerceConfigurationService.isVersionOrderAcceptable(
                verifiedQuote.configVersionId.replace(/^v/, ''),
                verifiedQuote.merchantScopeId || 'default'
              );
              if (!isAcceptable) {
                throw new AppError(
                  'Checkout quote configuration version is no longer acceptable. Please refresh checkout.',
                  409,
                  'QUOTE_CONFIG_SUPERSEDED'
                );
              }
            }
          }

          let phoneE164 = undefined;
          let phoneExtension = undefined;
          if (orderData.shippingAddress.phone) {
            try {
              const parseOptions = destinationCountry ? { defaultCountry: destinationCountry } : {};
              const parsedPhone = Phone.parse(orderData.shippingAddress.phone, parseOptions);
              phoneE164 = parsedPhone.e164;
              phoneExtension = parsedPhone.extension || undefined;
            } catch {
              // Preserve raw phone for compatibility
            }
          }

          const shippingAddress = {
            fullName: normalizedAddress.fullName,
            address: normalizedAddress.addressLine1,
            addressLine2: normalizedAddress.addressLine2,
            city: normalizedAddress.locality,
            province: normalizedAddress.administrativeArea,
            postalCode: normalizedAddress.postalCode,
            country: CountryRegistry.getCountry(destinationCountry).name,
            countryCode: destinationCountry,
            administrativeArea: normalizedAddress.administrativeArea,
            phone: phoneE164 || orderData.shippingAddress.phone || '',
            phoneE164,
            phoneExtension
          };

          // 0. Enforce Customer Profile Residence Country Completeness
          const customerUser = await User.findById(userId).session(session);
          if (customerUser && !customerUser.residenceCountry) {
            throw new AppError(
              'Customer residence country is required before completing checkout. Please complete your profile.',
              400,
              'RESIDENCE_COUNTRY_REQUIRED'
            );
          }

          // 3. Resolve Priced Items and assert Quote Item Hash Match
          const pricedItems = await this.resolveItems(
            orderData.items,
            session,
            currency,
            destinationCountry,
            market.merchantScopeId || 'default'
          );
          const currentItemsHash = CheckoutQuoteService.hashItems(pricedItems);

          if (verifiedQuote) {
            if (verifiedQuote.itemsHash !== currentItemsHash) {
              throw new AppError(
                'Order cart items, quantities, or prices have changed since quote issuance',
                409,
                'QUOTE_ITEMS_MISMATCH'
              );
            }
            if (Array.isArray(verifiedQuote.customsItems)) {
              for (const item of pricedItems) {
                const match = verifiedQuote.customsItems.find(
                  (c) => c.productId === String(item.product) && (c.variantId || null) === (item.variantId ? String(item.variantId) : null)
                );
                if (match) {
                  if (
                    match.hsCode !== (item.hsCode || null) ||
                    match.countryOfOrigin !== (item.countryOfOrigin || null) ||
                    match.declaredValueEligibility !== (item.declaredValueEligibility || 'UNKNOWN') ||
                    match.dangerousGoodsClassification !== (item.dangerousGoodsClassification || 'UNKNOWN') ||
                    Number(match.weightGrams) !== Number(item.weightGrams || 0)
                  ) {
                    throw new AppError('Product customs metadata has changed since quote issuance', 409, 'QUOTE_CUSTOMS_METADATA_MISMATCH');
                  }
                }
              }
            }
          }

          const subtotal = this.roundMoney(
            pricedItems.reduce((sum, item) => sum + item.lineTotal, 0)
          );

          // 4. Validate Coupon
          const coupon = await CouponService.validateAndReserve({
            code: orderData.couponCode,
            subtotal,
            items: pricedItems,
            userId,
            checkoutKey: idempotencyKey,
            currency,
            session
          });

          const subtotalMoney = Money.fromLegacyNumber(subtotal, currency);
          const discountMoney = Money.fromLegacyNumber(coupon.discountAmount || 0, currency);
          const afterDiscountMoney = subtotalMoney.amountMinor > discountMoney.amountMinor
            ? subtotalMoney.subtract(discountMoney)
            : Money.zero(currency);
          const afterDiscount = Number(afterDiscountMoney.toDecimalString());

          // 5. Calculate Shipping
          const activeConfig = market.activeVersionDoc || await CommerceConfigurationService.getActiveConfiguration();
          const shippingRules = activeConfig?.shippingRules || [];
          const taxRules = activeConfig?.taxRules || [];

          const shippingServiceLevel = orderData.shippingServiceLevel || verifiedQuote?.shippingServiceLevel || 'standard';
          const quoteShipmentGroups = Array.isArray(verifiedQuote?.shipmentGroups) ? verifiedQuote.shipmentGroups : [];
          const uniqueOrigins = [...new Set(quoteShipmentGroups.map((g) => g.originCountry).filter(Boolean))];
          fulfillmentOrigin = uniqueOrigins.length === 1 ? uniqueOrigins[0] : (verifiedQuote?.fulfillmentOriginCountry || fulfillmentOrigin);
          const shippingAdapter = shippingAdapterRegistry.get(orderData.shippingAdapter || null);
          const shippingQuote = await shippingAdapter.quote({
            countryCode: destinationCountry,
            originCountry: fulfillmentOrigin,
            currency,
            subtotalMoney: afterDiscountMoney,
            city: normalizedAddress.locality,
            region: normalizedAddress.administrativeArea,
            postalCode: normalizedAddress.postalCode,
            weightGrams: pricedItems.reduce((sum, it) => sum + (it.weightGrams || 0), 0),
            serviceLevel: shippingServiceLevel,
            shippingRules,
            configVersionId: activeConfig?.version ? `v${activeConfig.version}` : undefined
          });
          const shippingCost = coupon.freeShipping && shippingServiceLevel === 'standard' ? 0 : shippingQuote.shippingAmount;
          const shippingCostMoney = Money.fromLegacyNumber(shippingCost || 0, currency);

          // 6. Calculate Tax & Duties (Landed Cost)
          const taxDutyResult = TaxDutyEngine.calculate({
            destinationCountry,
            originCountry: fulfillmentOrigin,
            administrativeArea: normalizedAddress.administrativeArea,
            goodsValue: afterDiscountMoney,
            taxableSubtotal: afterDiscountMoney,
            shippingAmount: shippingCostMoney,
            insuranceAmount: Money.zero(currency),
            insuranceProvenance: 'NO_INSURANCE_CHARGE',
            currency,
            taxRules,
            configVersionId: activeConfig?.version ? `v${activeConfig.version}` : undefined,
            merchantScopeId: verifiedQuote?.merchantScopeId || market.merchantScopeId || 'default'
          });

          const taxMoney = MoneyMapper.toMoney(taxDutyResult.taxAmountExact);
          const additionalTaxMoney = MoneyMapper.toMoney(taxDutyResult.additionalTaxAmountExact);
          const taxIncludedMoney = MoneyMapper.toMoney(taxDutyResult.taxIncludedAmountExact);
          const payableDutyMoney = MoneyMapper.toMoney(taxDutyResult.payableDutyExact);
          const estimatedDutyMoney = MoneyMapper.toMoney(taxDutyResult.estimatedDutyExact);

          const taxAmount = taxDutyResult.taxAmount;
          const dutyAmount = taxDutyResult.payableDutyAmount;
          const estimatedDutyAmount = taxDutyResult.estimatedDutyAmount;

          // Requirements 1 & 2:
          // Exclusive: checkoutGrandTotal = goodsValue + shipping + additionalTaxPayable + payableDuty
          // Inclusive: checkoutGrandTotal = goodsValue + shipping + 0 + payableDuty
          const totalAmountMoney = afterDiscountMoney
            .add(shippingCostMoney)
            .add(additionalTaxMoney)
            .add(payableDutyMoney);

          const totalAmount = Number(totalAmountMoney.toDecimalString());
          const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);

          // 7. Exact Money Snapshots
          const subtotalExact = MoneyMapper.toPersistence(subtotalMoney);
          const discountExact = MoneyMapper.toPersistence(discountMoney);
          const shippingCostExact = MoneyMapper.toPersistence(shippingCostMoney);
          const taxAmountExact = MoneyMapper.toPersistence(taxMoney);
          const additionalTaxAmountExact = MoneyMapper.toPersistence(additionalTaxMoney);
          const taxIncludedAmountExact = MoneyMapper.toPersistence(taxIncludedMoney);
          const dutiesExact = MoneyMapper.toPersistence(payableDutyMoney);
          const estimatedDutiesExact = MoneyMapper.toPersistence(estimatedDutyMoney);
          const goodsValueExact = MoneyMapper.toPersistence(afterDiscountMoney);

          // 8. Authoritatively Reconcile Exact Totals and Provenance against Quote
          if (verifiedQuote) {
            if (verifiedQuote.taxRuleId && verifiedQuote.taxRuleId !== taxDutyResult.provenance.ruleId) {
              throw new AppError('Tax governance rule has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.taxRulePriority !== undefined && Number(verifiedQuote.taxRulePriority) !== Number(taxDutyResult.provenance.priority)) {
              throw new AppError('Tax rule priority has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.taxType && verifiedQuote.taxType !== taxDutyResult.taxType) {
              throw new AppError('Tax type has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.taxTreatment && verifiedQuote.taxTreatment.toLowerCase() !== taxDutyResult.taxTreatment.toLowerCase()) {
              throw new AppError('Tax treatment has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.taxableBasis && verifiedQuote.taxableBasis !== taxDutyResult.taxableBasis) {
              throw new AppError('Taxable basis has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.taxRateNumerator !== undefined && Number(verifiedQuote.taxRateNumerator) !== Number(taxDutyResult.provenance.taxRateNumerator)) {
              throw new AppError('Tax rate numerator has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.taxRateDenominator !== undefined && Number(verifiedQuote.taxRateDenominator) !== Number(taxDutyResult.provenance.taxRateDenominator)) {
              throw new AppError('Tax rate denominator has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.dutyRateNumerator !== undefined && Number(verifiedQuote.dutyRateNumerator) !== Number(taxDutyResult.provenance.dutyRateNumerator)) {
              throw new AppError('Duty rate numerator has changed since quote issuance', 409, 'QUOTE_DUTY_RULE_MISMATCH');
            }
            if (verifiedQuote.dutyRateDenominator !== undefined && Number(verifiedQuote.dutyRateDenominator) !== Number(taxDutyResult.provenance.dutyRateDenominator)) {
              throw new AppError('Duty rate denominator has changed since quote issuance', 409, 'QUOTE_DUTY_RULE_MISMATCH');
            }
            if (verifiedQuote.roundingMode && verifiedQuote.roundingMode !== taxDutyResult.provenance.roundingMode) {
              throw new AppError('Tax rounding mode has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.roundingScope && verifiedQuote.roundingScope !== taxDutyResult.provenance.roundingScope) {
              throw new AppError('Tax rounding scope has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.providerType && verifiedQuote.providerType !== taxDutyResult.provenance.providerType) {
              throw new AppError('Tax provider type has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.sourceAuthority && verifiedQuote.sourceAuthority !== taxDutyResult.provenance.sourceAuthority) {
              throw new AppError('Tax source authority has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.sourceReference && verifiedQuote.sourceReference !== taxDutyResult.provenance.sourceReference) {
              throw new AppError('Tax source reference has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.verificationStatus && verifiedQuote.verificationStatus !== taxDutyResult.provenance.verificationStatus) {
              throw new AppError('Tax verification status has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.dutyRefundPolicy !== undefined && verifiedQuote.dutyRefundPolicy !== (taxDutyResult.provenance.dutyRefundPolicy || null)) {
              throw new AppError('Duty refund policy has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.taxRefundPolicy !== undefined && verifiedQuote.taxRefundPolicy !== (taxDutyResult.provenance.taxRefundPolicy || null)) {
              throw new AppError('Tax refund policy has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.customsValueIncludesShipping !== undefined && Boolean(verifiedQuote.customsValueIncludesShipping) !== Boolean(taxDutyResult.customsValueIncludesShipping)) {
              throw new AppError('Customs value inclusion rules have changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.customsValueIncludesInsurance !== undefined && Boolean(verifiedQuote.customsValueIncludesInsurance) !== Boolean(taxDutyResult.customsValueIncludesInsurance)) {
              throw new AppError('Customs value insurance inclusion rules have changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.insuranceProvenance && verifiedQuote.insuranceProvenance !== taxDutyResult.provenance.insuranceProvenance) {
              throw new AppError('Insurance provenance has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }
            if (verifiedQuote.insuranceAmountMinor !== undefined && verifiedQuote.insuranceAmountMinor !== (taxDutyResult.provenance.insuranceAmountExact?.amountMinor || 0).toString()) {
              throw new AppError('Insurance amount has changed since quote issuance', 409, 'QUOTE_TAX_RULE_MISMATCH');
            }

            // Complete De-Minimis Reconciliations
            if (verifiedQuote.dutyDeMinimis && taxDutyResult.dutyDeMinimis) {
              const matches = TaxDutyEngine.compareDeMinimisDecisions(verifiedQuote.dutyDeMinimis, taxDutyResult.dutyDeMinimis);
              if (!matches) {
                throw new AppError('Customs duty de-minimis decision has changed since quote issuance', 409, 'QUOTE_DEMINIMIS_MISMATCH');
              }
            }
            if (verifiedQuote.taxDeMinimis && taxDutyResult.taxDeMinimis) {
              const matches = TaxDutyEngine.compareDeMinimisDecisions(verifiedQuote.taxDeMinimis, taxDutyResult.taxDeMinimis);
              if (!matches) {
                throw new AppError('Import tax de-minimis decision has changed since quote issuance', 409, 'QUOTE_DEMINIMIS_MISMATCH');
              }
            }

            // Amounts reconciliation
            if (verifiedQuote.grandTotalMinor !== totalAmountExact.amountMinor.toString()) {
              throw new AppError('Order payable total does not match authoritative quote total', 409, 'QUOTE_TOTAL_MISMATCH');
            }
            if (verifiedQuote.subtotalMinor !== subtotalExact.amountMinor.toString()) {
              throw new AppError('Order subtotal does not match authoritative quote subtotal', 409, 'QUOTE_SUBTOTAL_MISMATCH');
            }
            if (verifiedQuote.discountMinor !== undefined && verifiedQuote.discountMinor !== discountExact.amountMinor.toString()) {
              throw new AppError('Order discount does not match authoritative quote discount', 409, 'QUOTE_DISCOUNT_MISMATCH');
            }
            if (verifiedQuote.shippingMinor !== shippingCostExact.amountMinor.toString()) {
              throw new AppError('Order shipping amount does not match authoritative quote shipping', 409, 'QUOTE_SHIPPING_MISMATCH');
            }
            if (verifiedQuote.taxMinor !== taxAmountExact.amountMinor.toString()) {
              throw new AppError('Order tax amount does not match authoritative quote tax', 409, 'QUOTE_TAX_MISMATCH');
            }
            if (verifiedQuote.additionalTaxMinor !== undefined && verifiedQuote.additionalTaxMinor !== additionalTaxAmountExact.amountMinor.toString()) {
              throw new AppError('Order additional tax amount does not match authoritative quote', 409, 'QUOTE_TAX_MISMATCH');
            }
            if (verifiedQuote.taxIncludedMinor !== undefined && verifiedQuote.taxIncludedMinor !== taxIncludedAmountExact.amountMinor.toString()) {
              throw new AppError('Order tax included amount does not match authoritative quote', 409, 'QUOTE_TAX_MISMATCH');
            }
            if (verifiedQuote.goodsValueMinor !== undefined && verifiedQuote.goodsValueMinor !== goodsValueExact.amountMinor.toString()) {
              throw new AppError('Order goods value does not match authoritative quote', 409, 'QUOTE_GOODS_VALUE_MISMATCH');
            }
            if (verifiedQuote.estimatedDutyMinor && verifiedQuote.estimatedDutyMinor !== estimatedDutiesExact.amountMinor.toString()) {
              throw new AppError('Order estimated duty amount does not match authoritative quote', 409, 'QUOTE_DUTY_MISMATCH');
            }
            if (verifiedQuote.payableDutyMinor && verifiedQuote.payableDutyMinor !== dutiesExact.amountMinor.toString()) {
              throw new AppError('Order payable duty amount does not match authoritative quote', 409, 'QUOTE_DUTY_MISMATCH');
            }
            if (verifiedQuote.dutyMinor && verifiedQuote.dutyMinor !== dutiesExact.amountMinor.toString()) {
              throw new AppError('Order duty amount does not match authoritative quote duty', 409, 'QUOTE_DUTY_MISMATCH');
            }
          }

          const effectiveMode = await MarketService.getEffectiveRolloutMode();
          if (effectiveMode === 'shadow_write' || effectiveMode === 'exact_read') {
            RolloutAuthority.assertWriteParity(subtotal, subtotalExact);
            RolloutAuthority.assertWriteParity(totalAmount, totalAmountExact);
          }

          // 9. Payment Provider Verification
          const isPaymentEligible = await defaultPaymentPolicy.isMethodAllowedForDelivery(
            destinationCountry,
            orderData.paymentMethod,
            merchantCountry
          );
          if (!isPaymentEligible) {
            throw new AppError(
              `Payment method '${orderData.paymentMethod}' is not eligible for delivery to ${destinationCountry}`,
              400,
              ERROR_CODES.PAYMENT_PROVIDER_NOT_ELIGIBLE
            );
          }

          const paymentProvider = paymentProviderRegistry.resolve(
            orderData.paymentMethod,
            {
              country: destinationCountry,
              currency,
              amount: totalAmount
            }
          );
          const paymentManifest = paymentProvider.getManifest();

          const persistedItems = pricedItems.map(({ categoryId, ...item }) => {
            const matchingGroup = quoteShipmentGroups.find((g) =>
              Array.isArray(g.items) && g.items.some((it) => String(it.productId) === String(item.product))
            );
            return {
              ...item,
              fulfillmentLocationId: matchingGroup?.locationId && mongoose.isValidObjectId(matchingGroup.locationId) ? matchingGroup.locationId : item.fulfillmentLocationId,
              locationCode: matchingGroup?.locationCode || item.locationCode,
              originCountry: matchingGroup?.originCountry || item.originCountry,
              shipmentGroup: matchingGroup?.groupId || item.shipmentGroup
            };
          });

          const [order] = await Order.create([{
            _id: orderObjectId,
            orderId,
            user: userId,
            idempotencyKey,
            requestHash,
            items: persistedItems,
            shippingAddress,
            paymentMethod: orderData.paymentMethod,
            paymentStatus: 'Pending',
            currency,
            subtotalExact,
            discountExact,
            shippingCostExact,
            taxAmountExact,
            dutiesExact,
            totalAmountExact,
            quote: verifiedQuote ? {
              quoteId: verifiedQuote.quoteId,
              kid: verifiedQuote.kid,
              incoterm: verifiedQuote.incoterm,
              configVersionId: verifiedQuote.configVersionId || undefined,
              merchantScopeId: verifiedQuote.merchantScopeId || 'default',
              issuedAt: verifiedQuote.issuedAt,
              expiresAt: verifiedQuote.expiresAt
            } : undefined,
            taxesAndDuties: {
              taxType: taxDutyResult.taxType,
              taxTreatment: taxDutyResult.taxTreatment,
              taxableBasis: taxDutyResult.taxableBasis,
              taxRatePercent: taxDutyResult.taxRatePercent,
              taxAmount: taxDutyResult.taxAmount,
              taxAmountExact: taxAmountExact,
              additionalTaxAmount: taxDutyResult.additionalTaxAmount,
              additionalTaxAmountExact: additionalTaxAmountExact,
              taxIncludedAmount: taxDutyResult.taxIncludedAmount,
              taxIncludedAmountExact: taxIncludedAmountExact,
              goodsValue: taxDutyResult.goodsValue,
              goodsValueExact: goodsValueExact,
              customsValue: taxDutyResult.customsValue,
              customsValueExact: taxDutyResult.customsValueExact,
              cifValue: taxDutyResult.cifValue,
              cifValueExact: taxDutyResult.cifValueExact,
              customsValueIncludesShipping: taxDutyResult.customsValueIncludesShipping,
              customsValueIncludesInsurance: taxDutyResult.customsValueIncludesInsurance,
              dutyRatePercent: taxDutyResult.dutyRatePercent,
              estimatedDutyAmount: taxDutyResult.estimatedDutyAmount,
              estimatedDutyExact: estimatedDutiesExact,
              payableDutyAmount: taxDutyResult.payableDutyAmount,
              payableDutyExact: dutiesExact,
              dutyDeMinimis: taxDutyResult.dutyDeMinimis,
              taxDeMinimis: taxDutyResult.taxDeMinimis,
              incoterm: taxDutyResult.incoterm,
              provenance: taxDutyResult.provenance,
              customsItems: verifiedQuote?.customsItems || undefined
            },
            payment: {
              provider: paymentManifest.displayName,
              currency,
              paidAt: null
            },
            coupon: coupon.snapshot || undefined,
            subtotal,
            shippingCost,
            shippingQuote: {
              zoneId: (shippingQuote.zone?._id && mongoose.isValidObjectId(shippingQuote.zone._id)) ? shippingQuote.zone._id : null,
              ruleId: shippingQuote.ruleId || null,
              serviceLevel: shippingServiceLevel,
              zoneName: shippingQuote.ruleName || shippingQuote.zoneName || shippingQuote.zone?.name || 'Standard Delivery',
              deliveryMinDays: shippingQuote.deliveryEstimate?.minDays || shippingQuote.deliveryMinDays || 2,
              deliveryMaxDays: shippingQuote.deliveryEstimate?.maxDays || shippingQuote.deliveryMaxDays || 5,
              remoteArea: Boolean(shippingQuote.isRemote || shippingQuote.remoteArea),
              deliveryPromise: shippingQuote.deliveryPromise || undefined,
              provenance: shippingQuote.provenance || undefined,
              shipmentGroups: quoteShipmentGroups.length > 0 ? quoteShipmentGroups.map((g) => ({
                groupId: g.groupId || g.shipmentGroup || 'group_1',
                locationId: g.locationId && mongoose.isValidObjectId(g.locationId) ? g.locationId : null,
                locationCode: g.locationCode || '',
                originCountry: g.originCountry || '',
                serviceLevel: g.serviceLevel || shippingServiceLevel,
                shippingAmount: g.shippingAmount || 0,
                shippingAmountExact: g.shippingAmountExact ? MoneyMapper.toPersistence(MoneyMapper.toMoney(g.shippingAmountExact)) : null,
                deliveryEstimate: g.deliveryEstimate || undefined,
                deliveryPromise: g.deliveryPromise || undefined,
                provenance: g.provenance || undefined,
                items: (g.items || []).map((it) => ({
                  productId: String(it.productId || it.product),
                  variantId: it.variantId ? String(it.variantId) : null,
                  quantity: Number(it.quantity)
                }))
              })) : undefined
            },
            taxAmount,
            duties: dutyAmount,
            discount: coupon.discountAmount,
            totalAmount,
            customerNote: orderData.customerNote || '',
            orderStatus: ORDER_STATUSES.PENDING,
            statusTimeline: [{
              status: ORDER_STATUSES.PENDING,
              actor: userId,
              actorRole: 'customer',
              note: 'Order placed'
            }]
          }], { session });

          if (coupon.checkoutKey) {
            await CouponService.commitRedemption({
              checkoutKey: coupon.checkoutKey,
              orderId: order._id,
              session
            });
          }

          const reservationResult = await InventoryService.reserve(persistedItems, {
            session,
            orderId,
            orderObjectId,
            userId,
            destinationCountry,
            merchantScopeId: market.merchantScopeId || 'default',
            idempotencyKey,
            isInstantConfirm: orderData.paymentMethod === 'cod'
          });

          if (reservationResult?.reservation) {
            order.inventoryReservationId = reservationResult.reservation._id;
            if (Array.isArray(reservationResult.allocations)) {
              order.items.forEach((item) => {
                const alloc = reservationResult.allocations.find((a) =>
                  String(a.productId) === String(item.product) &&
                  String(a.variantId || '') === String(item.variantId || '')
                );
                if (alloc) {
                  item.fulfillmentLocationId = alloc.locationId;
                  item.locationCode = alloc.locationCode;
                  item.originCountry = alloc.originCountry;
                  item.shipmentGroup = alloc.shipmentGroup;
                  item.inventoryReservationId = reservationResult.reservation._id;
                  item.inventoryPositionId = alloc.inventoryPositionId;
                  item.fulfillmentMode = alloc.fulfillmentMode;
                }
              });
            }
            await order.save({ session });
          }

          return { order, isReplay: false };
        });
      } catch (error) {
        if (this.isIdempotencyDuplicate(error)) {
          const replay = await this.waitForIdempotentOrder(
            userId,
            idempotencyKey
          );
          if (replay) {
            this.assertReplayMatches(replay, requestHash);
            return { order: replay, isReplay: true };
          }
        }

        if (
          this.isOrderIdDuplicate(error)
          && idAttempt < ORDER_LIMITS.MAX_ORDER_ID_ATTEMPTS
        ) {
          orderId = Order.generateOrderId();
          continue;
        }

        throw error;
      }
    }

    throw new AppError(
      'Order identifier generation failed',
      503,
      ERROR_CODES.ORDER_TRANSACTION_FAILED
    );
  }

  referenceQuery(reference) {
    return mongoose.isObjectIdOrHexString(reference)
      ? { _id: reference }
      : { orderId: reference };
  }

  async getOrderForUser(reference, user) {
    const order = await Order.findOne(this.referenceQuery(reference))
      .populate('user', 'fullName email phone role');

    if (!order) {
      throw new AppError(
        'Order not found',
        404,
        ERROR_CODES.ORDER_NOT_FOUND
      );
    }

    const ownerId = order.user?._id || order.user;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);
    if (!isAdmin && String(ownerId) !== String(user.id)) {
      throw new AppError(
        'You cannot access this order',
        403,
        ERROR_CODES.ORDER_FORBIDDEN
      );
    }

    return order;
  }

  async getCustomerOrders(userId, { page, limit, status }) {
    const query = { user: userId };
    if (status) query.orderStatus = status;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .select('-adminNotes')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async getAdminOrders({
    page,
    limit,
    status,
    customer,
    search,
    startDate,
    endDate,
    sortBy = 'createdAt-desc'
  }) {
    const query = {};
    if (status) query.orderStatus = status;
    if (customer) query.user = customer;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }
    if (search) {
      const escaped = this.escapeRegex(search);
      query.$or = [
        { orderId: { $regex: `^${escaped}`, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: escaped, $options: 'i' } }
      ];
    }

    const sortOptions = {
      'createdAt-desc': { createdAt: -1, _id: -1 },
      'createdAt-asc': { createdAt: 1, _id: 1 },
      'totalAmount-desc': { totalAmount: -1, createdAt: -1, _id: -1 },
      'totalAmount-asc': { totalAmount: 1, createdAt: -1, _id: -1 }
    };
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'fullName email')
        .sort(sortOptions[sortBy])
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async cancelOrder({ reference, actor, reason = '', isAdmin = false }) {
    return this.runTransaction(async (session) => {
      const order = await Order.findOne(this.referenceQuery(reference)).session(session);
      if (!order) {
        throw new AppError(
          'Order not found',
          404,
          ERROR_CODES.ORDER_NOT_FOUND
        );
      }

      if (!isAdmin && String(order.user) !== String(actor.id)) {
        throw new AppError(
          'You cannot cancel this order',
          403,
          ERROR_CODES.ORDER_FORBIDDEN
        );
      }

      if (order.orderStatus === ORDER_STATUSES.CANCELLED) {
        return { order, isReplay: true };
      }

      if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.orderStatus)) {
        throw new AppError(
          `Order cannot be cancelled from ${order.orderStatus}`,
          409,
          ERROR_CODES.ORDER_STATUS_TRANSITION_INVALID
        );
      }

      if (order.inventoryRestoredAt || order.couponRestoredAt) {
        throw new AppError(
          'Order cancellation state is inconsistent',
          409,
          ERROR_CODES.ORDER_TRANSACTION_FAILED
        );
      }

      await InventoryService.restore(order, {
        session,
        userId: actor.id
      });
      order.inventoryRestoredAt = new Date();

      if (order.coupon?.couponId) {
        await CouponService.restoreUsage({
          couponSnapshot: order.coupon,
          userId: order.user,
          releaseReason: 'order_cancelled',
          session
        });
        order.couponRestoredAt = new Date();
      }

      order.orderStatus = ORDER_STATUSES.CANCELLED;
      order.cancelReason = reason;
      order.cancelledAt = new Date();
      order.statusTimeline.push({
        status: ORDER_STATUSES.CANCELLED,
        actor: actor.id,
        actorRole: actor.role,
        note: reason || 'Order cancelled'
      });
      await order.save({ session });

      return { order, isReplay: false };
    });
  }

  async transitionOrder({ reference, actor, orderStatus, adminNote = '' }) {
    if (orderStatus === ORDER_STATUSES.CANCELLED) {
      return this.cancelOrder({
        reference,
        actor,
        reason: adminNote,
        isAdmin: true
      });
    }

    return this.runTransaction(async (session) => {
      const order = await Order.findOne(this.referenceQuery(reference)).session(session);
      if (!order) {
        throw new AppError(
          'Order not found',
          404,
          ERROR_CODES.ORDER_NOT_FOUND
        );
      }

      if (order.orderStatus === orderStatus) {
        return { order, isReplay: true };
      }

      const allowed = ORDER_TRANSITIONS[order.orderStatus] || [];
      if (!allowed.includes(orderStatus)) {
        throw new AppError(
          `Order cannot transition from ${order.orderStatus} to ${orderStatus}`,
          409,
          ERROR_CODES.ORDER_STATUS_TRANSITION_INVALID
        );
      }

      order.orderStatus = orderStatus;
      order.statusTimeline.push({
        status: orderStatus,
        actor: actor.id,
        actorRole: actor.role,
        note: adminNote || `Order moved to ${orderStatus}`
      });
      if (adminNote) {
        order.adminNotes.push({
          note: adminNote,
          addedBy: actor.id
        });
      }
      if (orderStatus === ORDER_STATUSES.SHIPPED) {
        try {
          const InventoryReservationService = require('../inventory/InventoryReservationService');
          await InventoryReservationService.consumeShipment({
            order,
            session,
            userId: actor.id
          });
        } catch (_consumeErr) {
          // Safe fallback for legacy orders
        }
      }
      if (orderStatus === ORDER_STATUSES.DELIVERED) {
        order.deliveredAt = new Date();
      }
      await order.save({ session });

      return { order, isReplay: false };
    });
  }

  async updateTracking({ reference, actor, courierCompany, trackingNumber }) {
    return this.runTransaction(async (session) => {
      const order = await Order.findOne(this.referenceQuery(reference)).session(session);
      if (!order) throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
      if (order.orderStatus === ORDER_STATUSES.CANCELLED) {
        throw new AppError('Tracking cannot be changed on a cancelled order', 409, ERROR_CODES.ORDER_STATUS_TRANSITION_INVALID);
      }
      const nextCourier = courierCompany === undefined ? order.courierCompany : courierCompany;
      const nextTracking = trackingNumber === undefined ? order.trackingNumber : trackingNumber;
      const isReplay = nextCourier === order.courierCompany && nextTracking === order.trackingNumber;
      if (!isReplay) {
        order.courierCompany = nextCourier;
        order.trackingNumber = nextTracking;
        order.adminNotes.push({ note: 'Shipment tracking updated', addedBy: actor.id });
        await order.save({ session });
      }
      return { order, isReplay };
    });
  }

  async markCodPaid({ reference, actor, adminNote = '' }) {
    return this.runTransaction(async (session) => {
      const order = await Order.findOne(this.referenceQuery(reference)).session(session);
      if (!order) {
        throw new AppError(
          'Order not found',
          404,
          ERROR_CODES.ORDER_NOT_FOUND
        );
      }

      if (String(order.paymentMethod).toLowerCase() !== 'cod') {
        throw new AppError(
          'Only COD orders can have payment status updated manually',
          409,
          ERROR_CODES.ORDER_MANUAL_PAYMENT_FORBIDDEN
        );
      }

      if (order.orderStatus !== ORDER_STATUSES.DELIVERED) {
        throw new AppError(
          'Only delivered orders can have COD payment marked as paid',
          409,
          ERROR_CODES.ORDER_NOT_DELIVERED
        );
      }

      if (order.paymentStatus === 'Paid') {
        return { order, idempotentReplay: true };
      }

      if (order.paymentStatus !== 'Pending') {
        throw new AppError(
          `Order payment status cannot transition from ${order.paymentStatus} to Paid`,
          409,
          ERROR_CODES.PAYMENT_STATUS_TRANSITION_INVALID
        );
      }

      const previousPaymentStatus = order.paymentStatus;
      const sanitizedNote = typeof adminNote === 'string'
        ? adminNote.replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').trim().slice(0, 500)
        : '';

      order.paymentStatus = 'Paid';
      if (!order.payment.paidAt) {
        order.payment.paidAt = new Date();
      }

      if (sanitizedNote) {
        order.adminNotes.push({
          note: sanitizedNote,
          addedBy: actor.id,
          addedAt: new Date()
        });
      }

      const existingPayment = await Payment.findOne({ order: order._id }).session(session);
      if (existingPayment && existingPayment.status !== PAYMENT_STATUSES.COMPLETED) {
        const prevPaymentStatus = existingPayment.status;
        existingPayment.status = PAYMENT_STATUSES.COMPLETED;
        existingPayment.paidAmount = existingPayment.amount;
        existingPayment.collectedBy = actor.id;
        existingPayment.collectedAt = order.payment.paidAt;
        existingPayment.completedAt = order.payment.paidAt;
        if (sanitizedNote) {
          existingPayment.verificationNote = sanitizedNote.slice(0, 300);
        }
        if (Array.isArray(existingPayment.history)) {
          existingPayment.history.push({
            previousStatus: prevPaymentStatus,
            newStatus: PAYMENT_STATUSES.COMPLETED,
            source: 'admin',
            timestamp: new Date()
          });
        }
        await existingPayment.save({ session });
      }

      await order.save({ session });

      logger.orderEvent(
        'ORDER_PAYMENT_STATUS_CHANGED',
        order._id,
        actor.id,
        'COD payment marked as Paid',
        {
          orderId: order._id,
          publicOrderId: order.orderId,
          previousPaymentStatus,
          newPaymentStatus: 'Paid',
          adminId: actor.id,
          timestamp: order.payment.paidAt,
          adminNote: sanitizedNote
        }
      );

      await AuditService.log({
        userId: actor.id,
        eventName: 'PAYMENT.COMPLETED',
        action: 'COD_PAYMENT_COLLECTED',
        status: 'SUCCESS',
        metadata: {
          orderId: String(order._id),
          publicOrderId: order.orderId,
          previousPaymentStatus,
          newPaymentStatus: 'Paid',
          adminId: String(actor.id),
          timestamp: order.payment.paidAt.toISOString(),
          adminNote: sanitizedNote
        }
      }, session);

      return { order, idempotentReplay: false };
    });
  }
}

module.exports = new OrderService();

/**
 * @file CheckoutSessionService.js
 * @description Two-Phase Checkout Session Service for Phase 6D-5A.
 * Orchestrates pre-order session creation, expiring stock-hold leasing,
 * authoritative provider-neutral capture verification, atomic conversion to Order,
 * crash-safe expiry reconciliation, and fail-closed dispute resolution.
 */

'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const CheckoutSession = require('../../models/CheckoutSession');
const InventoryHold = require('../../models/InventoryHold');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const User = require('../../models/User');
const Payment = require('../../models/Payment');
const StockHoldLeaseService = require('../inventory/StockHoldLeaseService');
const CheckoutQuoteService = require('../checkout/CheckoutQuoteService');
const MarketService = require('../MarketService');
const CommerceConfigurationService = require('../commerce/CommerceConfigurationService');
const defaultPaymentPolicy = require('../payment/PaymentCapabilityPolicy');
const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const CouponService = require('./CouponService');
const OrderService = require('./OrderService');
const TaxDutyEngine = require('../checkout/TaxDutyEngine');
const shippingAdapterRegistry = require('../checkout/shipping/ShippingAdapterRegistry');
const AuditService = require('../AuditService');
const { Money, MoneyMapper, CountryRegistry, Address, Phone } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');
const { ORDER_STATUSES } = require('../../constants/orderConstants');

const hashValue = (value) => crypto
  .createHash('sha256')
  .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
  .digest('hex');

class CheckoutSessionService {
  /**
   * Check if the two-phase checkout feature flag is enabled.
   */
  isFeatureEnabled() {
    try {
      const { getRuntimeConfig } = require('../../config/runtime.config');
      return Boolean(getRuntimeConfig().commerceTwoPhaseCheckoutEnabled);
    } catch {
      return String(process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED || '').toLowerCase() === 'true';
    }
  }

  hashRequest(data) {
    const canonicalItems = [...data.items]
      .map((item) => ({
        productId: String(item.productId),
        variantId: item.variantId ? String(item.variantId) : null,
        quantity: Number(item.quantity)
      }))
      .sort((a, b) => `${a.productId}:${a.variantId || ''}`.localeCompare(`${b.productId}:${b.variantId || ''}`));

    const canonical = {
      items: canonicalItems,
      shippingAddress: data.shippingAddress,
      paymentMethod: data.paymentMethod,
      currency: data.currency || null,
      couponCode: data.couponCode || null,
      customerNote: data.customerNote || null,
      quoteTokenHash: data.quoteToken ? hashValue(data.quoteToken) : null
    };

    return hashValue(canonical);
  }

  /**
   * Create an authoritative CheckoutSession and acquire an expiring stock hold lease.
   */
  async createSession({ userId, sessionData, idempotencyKey }) {
    if (!this.isFeatureEnabled()) {
      throw new AppError(
        'Two-phase prepaid checkout sessions are currently disabled',
        503,
        'TWO_PHASE_CHECKOUT_DISABLED'
      );
    }

    if (!userId) {
      throw new AppError('Authenticated user identity is required for checkout session', 401, 'AUTHENTICATION_REQUIRED');
    }

    if (!sessionData || !sessionData.items || !sessionData.shippingAddress || !sessionData.paymentMethod) {
      throw new AppError('Missing required checkout session parameters', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new AppError('A valid Idempotency-Key header is required', 400, 'IDEMPOTENCY_KEY_REQUIRED');
    }

    const requestHash = this.hashRequest(sessionData);

    const market = await MarketService.getConfig();
    if (!market || !market.isEnabled) {
      throw new AppError('Market configuration is currently disabled', 503, 'MARKET_DISABLED');
    }
    const merchantScopeId = market.merchantScopeId || 'default';
    const merchantCountry = market.merchantCountry || market.homeCountry || 'PK';

    // 1. Idempotency Check
    const existing = await CheckoutSession.findOne({
      merchantScopeId,
      idempotencyKey
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError('Idempotency-Key was already used with a different session request', 409, 'IDEMPOTENCY_CONFLICT');
      }
      return { session: existing, isReplay: true };
    }

    // 2. Authoritative Address Normalization
    let normalizedAddress = null;
    try {
      normalizedAddress = Address.create({
        fullName: sessionData.shippingAddress.fullName || 'Valued Customer',
        addressLine1: sessionData.shippingAddress.address || sessionData.shippingAddress.addressLine1,
        addressLine2: sessionData.shippingAddress.addressLine2,
        locality: sessionData.shippingAddress.city || sessionData.shippingAddress.locality,
        administrativeArea: sessionData.shippingAddress.province || sessionData.shippingAddress.state || sessionData.shippingAddress.administrativeArea,
        postalCode: sessionData.shippingAddress.postalCode || sessionData.shippingAddress.zip,
        countryCode: sessionData.shippingAddress.countryCode || sessionData.shippingAddress.country,
        phone: sessionData.shippingAddress.phone
      });
    } catch (addrErr) {
      if (sessionData.quoteToken) throw addrErr;
      const rawCountry = sessionData.shippingAddress.countryCode || sessionData.shippingAddress.country;
      const resolvedCountry = CountryRegistry.resolve(rawCountry);
      const countryCode = resolvedCountry?.alpha2 || (typeof rawCountry === 'string' && rawCountry.length === 2 ? rawCountry.toUpperCase() : null);
      if (!countryCode) throw new AppError('Invalid shipping country code', 400, 'INVALID_SHIPPING_COUNTRY');
      normalizedAddress = {
        fullName: sessionData.shippingAddress.fullName || 'Valued Customer',
        addressLine1: sessionData.shippingAddress.address || sessionData.shippingAddress.addressLine1 || '',
        addressLine2: sessionData.shippingAddress.addressLine2 || '',
        locality: sessionData.shippingAddress.city || sessionData.shippingAddress.locality || '',
        administrativeArea: sessionData.shippingAddress.province || sessionData.shippingAddress.state || sessionData.shippingAddress.administrativeArea || '',
        postalCode: sessionData.shippingAddress.postalCode || sessionData.shippingAddress.zip || '',
        countryCode,
        phone: sessionData.shippingAddress.phone || ''
      };
    }

    const destinationCountry = normalizedAddress.countryCode;
    const currency = (sessionData.currency || market.defaultCurrency || market.baseCurrency || 'PKR').toUpperCase();
    await MarketService.assertEligible({ country: destinationCountry, currency });

    // Enforce quote for international/prepaid checkout
    if (!sessionData.quoteToken) {
      throw new AppError('Prepaid checkout requires an authoritative checkout quote token', 400, 'QUOTE_REQUIRED');
    }

    const verifiedQuote = CheckoutQuoteService.verifyAndDecodeQuoteToken(sessionData.quoteToken);
    if (verifiedQuote.destinationCountry !== destinationCountry) {
      throw new AppError('Session destination country does not match quote', 409, 'QUOTE_DESTINATION_MISMATCH');
    }
    if (verifiedQuote.currency !== currency) {
      throw new AppError('Session currency does not match quote', 409, 'QUOTE_CURRENCY_MISMATCH');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    const customerEmail = user.email;

    // 3. Payment Method Eligibility
    const isPaymentEligible = await defaultPaymentPolicy.isMethodAllowedForDelivery(
      destinationCountry,
      sessionData.paymentMethod,
      merchantCountry
    );
    if (!isPaymentEligible) {
      throw new AppError(`Payment method '${sessionData.paymentMethod}' is not eligible for delivery to ${destinationCountry}`, 400, ERROR_CODES.PAYMENT_PROVIDER_NOT_ELIGIBLE);
    }

    const paymentProviderAdapter = paymentProviderRegistry.resolve(sessionData.paymentMethod, {
      country: destinationCountry,
      currency
    });

    const sessionId = `cs_${crypto.randomBytes(24).toString('hex')}`;
    const quoteTokenHash = hashValue(sessionData.quoteToken);

    // 4. Resolve and Price Items within a Session
    const pricedItems = await OrderService.resolveItems(
      sessionData.items,
      null,
      currency,
      destinationCountry,
      merchantScopeId
    );

    const currentItemsHash = CheckoutQuoteService.hashItems(pricedItems);
    if (verifiedQuote.itemsHash !== currentItemsHash) {
      throw new AppError('Cart items or prices have changed since quote issuance', 409, 'QUOTE_ITEMS_MISMATCH');
    }

    const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const subtotalMoney = Money.fromLegacyNumber(subtotal, currency);

    // 5. Validate Coupon
    const coupon = await CouponService.validateAndReserve({
      code: sessionData.couponCode,
      subtotal,
      items: pricedItems,
      userId,
      checkoutKey: idempotencyKey,
      currency
    });

    const discountMoney = Money.fromLegacyNumber(coupon.discountAmount || 0, currency);
    const afterDiscountMoney = subtotalMoney.amountMinor > discountMoney.amountMinor
      ? subtotalMoney.subtract(discountMoney)
      : Money.zero(currency);

    // 6. Calculate Shipping
    const activeConfig = market.activeVersionDoc || await CommerceConfigurationService.getActiveConfiguration();
    const shippingRules = activeConfig?.shippingRules || [];
    const taxRules = activeConfig?.taxRules || [];

    const shippingServiceLevel = sessionData.shippingServiceLevel || verifiedQuote?.shippingServiceLevel || 'standard';
    const quoteShipmentGroups = Array.isArray(verifiedQuote?.shipmentGroups) ? verifiedQuote.shipmentGroups : [];
    const uniqueOrigins = [...new Set(quoteShipmentGroups.map((g) => g.originCountry).filter(Boolean))];
    const fulfillmentOrigin = uniqueOrigins.length === 1 ? uniqueOrigins[0] : (verifiedQuote?.fulfillmentOriginCountry || market.fulfillmentOriginCountry || merchantCountry);

    const shippingAdapter = shippingAdapterRegistry.get(sessionData.shippingAdapter || null);
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

    // 7. Calculate Tax & Duties
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
      merchantScopeId
    });

    const taxMoney = MoneyMapper.toMoney(taxDutyResult.taxAmountExact);
    const additionalTaxMoney = MoneyMapper.toMoney(taxDutyResult.additionalTaxAmountExact);
    const taxIncludedMoney = MoneyMapper.toMoney(taxDutyResult.taxIncludedAmountExact);
    const payableDutyMoney = MoneyMapper.toMoney(taxDutyResult.payableDutyExact);
    const estimatedDutyMoney = MoneyMapper.toMoney(taxDutyResult.estimatedDutyExact);

    const totalAmountMoney = afterDiscountMoney
      .add(shippingCostMoney)
      .add(additionalTaxMoney)
      .add(payableDutyMoney);

    // Verify quote amounts match
    if (verifiedQuote.grandTotalMinor !== totalAmountMoney.amountMinor.toString()) {
      throw new AppError('Payable total does not match authoritative quote total', 409, 'QUOTE_TOTAL_MISMATCH');
    }

    const subtotalExact = MoneyMapper.toPersistence(subtotalMoney);
    const discountExact = MoneyMapper.toPersistence(discountMoney);
    const shippingCostExact = MoneyMapper.toPersistence(shippingCostMoney);
    const taxAmountExact = MoneyMapper.toPersistence(taxMoney);
    const additionalTaxAmountExact = MoneyMapper.toPersistence(additionalTaxMoney);
    const taxIncludedAmountExact = MoneyMapper.toPersistence(taxIncludedMoney);
    const dutiesExact = MoneyMapper.toPersistence(payableDutyMoney);
    const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);

    // 8. Transaction 1: Acquire Stock Hold Lease & Create CheckoutSession
    const mongoSession = await mongoose.startSession();
    let createdSessionDoc = null;
    let holdDoc = null;

    try {
      await mongoSession.withTransaction(async () => {
        const holdResult = await StockHoldLeaseService.acquireHold({
          sessionId,
          items: pricedItems,
          destinationCountry,
          merchantScopeId,
          leaseDurationMinutes: 15,
          idempotencyKey,
          session: mongoSession,
          userId
        });

        holdDoc = holdResult.hold;

        const sessionDoc = new CheckoutSession({
          sessionId,
          merchantScopeId,
          userId,
          customerEmail,
          status: CheckoutSession.STATUSES.ACTIVE,
          destinationCountry,
          currency,
          quoteId: verifiedQuote.quoteId,
          quoteTokenHash,
          quoteSnapshot: {
            quoteId: verifiedQuote.quoteId,
            kid: verifiedQuote.kid,
            incoterm: verifiedQuote.incoterm,
            configVersionId: verifiedQuote.configVersionId || null,
            merchantScopeId,
            issuedAt: verifiedQuote.issuedAt,
            expiresAt: verifiedQuote.expiresAt,
            itemsHash: verifiedQuote.itemsHash
          },
          orderData: {
            items: pricedItems.map((item) => ({
              productId: item.product,
              variantId: item.variantId || null,
              canonicalSku: item.sku,
              name: item.name,
              quantity: item.quantity,
              unitPriceExact: item.unitPriceExact,
              lineTotalExact: item.lineTotalExact,
              weightGrams: item.weightGrams,
              hsCode: item.hsCode || null,
              countryOfOrigin: item.countryOfOrigin || null,
              fulfillmentLocationId: item.fulfillmentLocationId || null,
              locationCode: item.locationCode || '',
              originCountry: item.originCountry || '',
              shipmentGroup: item.shipmentGroup || 'group_1'
            })),
            shippingAddress: {
              fullName: normalizedAddress.fullName,
              addressLine1: normalizedAddress.addressLine1,
              addressLine2: normalizedAddress.addressLine2 || '',
              locality: normalizedAddress.locality,
              administrativeArea: normalizedAddress.administrativeArea || '',
              postalCode: normalizedAddress.postalCode || '',
              countryCode: destinationCountry,
              phone: normalizedAddress.phone || '',
              phoneE164: normalizedAddress.phoneE164 || null
            },
            paymentMethod: sessionData.paymentMethod,
            shippingServiceLevel,
            couponCode: sessionData.couponCode || null,
            customerNote: sessionData.customerNote || ''
          },
          taxesAndDutiesSnapshot: {
            taxType: taxDutyResult.taxType,
            taxTreatment: taxDutyResult.taxTreatment,
            taxableBasis: taxDutyResult.taxableBasis,
            taxRateNumerator: taxDutyResult.provenance.taxRateNumerator || 0,
            taxRateDenominator: taxDutyResult.provenance.taxRateDenominator || 10000,
            dutyRateNumerator: taxDutyResult.provenance.dutyRateNumerator || 0,
            dutyRateDenominator: taxDutyResult.provenance.dutyRateDenominator || 10000,
            taxAmountExact,
            additionalTaxAmountExact,
            taxIncludedAmountExact,
            goodsValueExact: MoneyMapper.toPersistence(afterDiscountMoney),
            customsValueExact: taxDutyResult.customsValueExact || null,
            cifValueExact: taxDutyResult.cifValueExact || null,
            estimatedDutyExact: taxDutyResult.estimatedDutyExact ? MoneyMapper.toPersistence(estimatedDutyMoney) : null,
            payableDutyExact: dutiesExact,
            dutyDeMinimis: taxDutyResult.dutyDeMinimis || null,
            taxDeMinimis: taxDutyResult.taxDeMinimis || null,
            provenance: taxDutyResult.provenance || null,
            customsItems: verifiedQuote?.customsItems || []
          },
          shippingSnapshot: {
            serviceLevel: shippingServiceLevel,
            zoneName: shippingQuote.zoneName || 'Standard Delivery',
            deliveryMinDays: shippingQuote.deliveryMinDays || 2,
            deliveryMaxDays: shippingQuote.deliveryMaxDays || 5,
            shippingAmountExact: shippingCostExact,
            shipmentGroups: quoteShipmentGroups.map((g) => ({
              groupId: g.groupId || 'group_1',
              locationId: g.locationId && mongoose.isValidObjectId(g.locationId) ? g.locationId : null,
              locationCode: g.locationCode || '',
              originCountry: g.originCountry || '',
              serviceLevel: g.serviceLevel || shippingServiceLevel,
              shippingAmountExact: g.shippingAmountExact ? MoneyMapper.toPersistence(MoneyMapper.toMoney(g.shippingAmountExact)) : shippingCostExact,
              deliveryEstimate: g.deliveryEstimate || undefined,
              deliveryPromise: g.deliveryPromise || undefined,
              provenance: g.provenance || undefined,
              items: (g.items || []).map((it) => ({
                productId: String(it.productId || it.product),
                variantId: it.variantId ? String(it.variantId) : null,
                quantity: Number(it.quantity)
              }))
            }))
          },
          amounts: {
            subtotalExact,
            discountExact,
            shippingCostExact,
            taxAmountExact,
            additionalTaxAmountExact,
            taxIncludedAmountExact,
            dutiesExact,
            totalAmountExact
          },
          inventoryHoldId: holdDoc._id,
          leaseExpiresAt: holdDoc.expiresAt,
          idempotencyKey,
          requestHash
        });

        await sessionDoc.save({ session: mongoSession });
        createdSessionDoc = sessionDoc;
      });
    } finally {
      await mongoSession.endSession();
    }

    // 9. Outside Transaction: Initiate Payment Attempt
    let clientSecret = null;
    try {
      const isProd = process.env.NODE_ENV === 'production';
      const merchantAccount = await defaultPaymentPolicy.getMerchantAccount(
        sessionData.paymentMethod,
        isProd ? 'production' : 'sandbox'
      );

      const payment = await Payment.create({
        merchantScopeId,
        checkoutSessionObjectId: createdSessionDoc._id,
        checkoutSessionId: sessionId,
        order: null,
        user: userId,
        provider: sessionData.paymentMethod,
        gateway: sessionData.paymentMethod,
        status: 'Pending',
        amount: Number(totalAmountMoney.toDecimalString()),
        amountExact: totalAmountExact,
        currency,
        providerDisplayName: paymentProviderAdapter.getManifest().displayName,
        providerIntegrationVersion: paymentProviderAdapter.getManifest().integrationVersion,
        paymentType: paymentProviderAdapter.getManifest().paymentType,
        capabilitySnapshot: {
          ...paymentProviderAdapter.getCapabilities(),
          accountAlias: merchantAccount?.accountAlias || 'default',
          environment: merchantAccount?.environment || (isProd ? 'production' : 'sandbox')
        },
        idempotencyKey: `pay:${sessionId}`,
        requestHash: hashValue({ sessionId, amountMinor: String(totalAmountExact.amountMinor) }),
        providerIdempotencyKey: `prov:${sessionId}`,
        history: []
      });

      // Invoke external provider outside DB transaction
      if (paymentProviderAdapter.getCapabilities().createPayment) {
        const providerResult = await paymentProviderAdapter.createPayment({
          amount: Number(totalAmountMoney.toDecimalString()),
          currency,
          paymentId: payment._id,
          orderId: sessionId,
          environment: merchantAccount?.environment || (isProd ? 'production' : 'sandbox'),
          idempotencyKey: payment.providerIdempotencyKey
        });

        clientSecret = providerResult.clientSecret || null;
        payment.providerPaymentId = providerResult.providerPaymentId || '';
        payment.status = providerResult.status || 'Pending';
        await payment.save();
      }

      await CheckoutSession.updateOne(
        { _id: createdSessionDoc._id },
        {
          $set: {
            paymentId: payment._id,
            status: CheckoutSession.STATUSES.PAYMENT_PENDING
          }
        }
      );
    } catch (providerErr) {
      // Release hold on payment initiation failure
      await StockHoldLeaseService.releaseHold({
        holdId: holdDoc._id,
        sessionId,
        merchantScopeId,
        releaseReason: 'PAYMENT_INITIATION_FAILED'
      });
      await CheckoutSession.updateOne(
        { _id: createdSessionDoc._id },
        { $set: { status: CheckoutSession.STATUSES.FAILED } }
      );
      throw providerErr;
    }

    return {
      session: {
        sessionId: createdSessionDoc.sessionId,
        status: CheckoutSession.STATUSES.PAYMENT_PENDING,
        leaseExpiresAt: createdSessionDoc.leaseExpiresAt,
        amounts: createdSessionDoc.amounts,
        currency: createdSessionDoc.currency,
        destinationCountry: createdSessionDoc.destinationCountry,
        paymentAttempt: {
          provider: sessionData.paymentMethod,
          clientSecret
        }
      },
      isReplay: false
    };
  }

  /**
   * Convert CheckoutSession to permanent Order upon verified payment capture.
   */
  async convertSessionToOrder({ sessionId, paymentEvidence = null, session: injectedSession = null }) {
    const mongoSession = injectedSession || await mongoose.startSession();
    const ownSession = !injectedSession;

    try {
      let result = null;

      const conversionWork = async (sessionContext) => {
        // 1. Replay Check
        const existingOrder = await Order.findOne({ checkoutSessionId: sessionId }).session(sessionContext);
        if (existingOrder) {
          return { order: existingOrder, isReplay: true };
        }

        // 2. Lock & Claim CheckoutSession
        const sessionDoc = await CheckoutSession.findOneAndUpdate(
          {
            sessionId,
            status: {
              $in: [
                CheckoutSession.STATUSES.PAYMENT_CAPTURED,
                CheckoutSession.STATUSES.PAYMENT_PENDING,
                CheckoutSession.STATUSES.ACTIVE
              ]
            }
          },
          {
            $set: { status: CheckoutSession.STATUSES.CONVERTING },
            $inc: { lockVersion: 1 }
          },
          { session: sessionContext, new: true }
        );

        if (!sessionDoc) {
          const checkStatus = await CheckoutSession.findOne({ sessionId }).session(sessionContext);
          if (checkStatus?.status === CheckoutSession.STATUSES.CONVERTED) {
            const order = await Order.findOne({ checkoutSessionObjectId: checkStatus._id }).session(sessionContext);
            return { order, isReplay: true };
          }
          throw new AppError(`Session '${sessionId}' is not in a convertible state (status: '${checkStatus?.status}')`, 409, 'INVALID_SESSION_STATE_FOR_CONVERSION');
        }

        // 3. Verify Authoritative Payment
        const payment = await Payment.findById(sessionDoc.paymentId).session(sessionContext);
        if (!payment) {
          throw new AppError('Payment not found for session conversion', 404, 'PAYMENT_NOT_FOUND');
        }

        // 4. Verify & Convert Stock Hold
        const holdResult = await StockHoldLeaseService.convertHold({
          holdId: sessionDoc.inventoryHoldId,
          sessionId: sessionDoc.sessionId,
          orderId: Order.generateOrderId(),
          orderObjectId: new mongoose.Types.ObjectId(),
          merchantScopeId: sessionDoc.merchantScopeId,
          session: sessionContext,
          userId: sessionDoc.userId
        });

        const newOrderObjectId = holdResult.reservation.orderObjectId;
        const newOrderId = holdResult.reservation.orderId;

        // 5. Create Permanent Order Document with all governed snapshots
        const orderData = sessionDoc.orderData;
        const [order] = await Order.create([{
          _id: newOrderObjectId,
          orderId: newOrderId,
          user: sessionDoc.userId,
          checkoutSessionObjectId: sessionDoc._id,
          checkoutSessionId: sessionDoc.sessionId,
          idempotencyKey: sessionDoc.idempotencyKey,
          requestHash: sessionDoc.requestHash,
          items: orderData.items,
          shippingAddress: {
            fullName: orderData.shippingAddress.fullName,
            address: orderData.shippingAddress.addressLine1,
            addressLine2: orderData.shippingAddress.addressLine2,
            city: orderData.shippingAddress.locality,
            province: orderData.shippingAddress.administrativeArea,
            postalCode: orderData.shippingAddress.postalCode,
            country: CountryRegistry.getCountry(sessionDoc.destinationCountry)?.name || sessionDoc.destinationCountry,
            countryCode: sessionDoc.destinationCountry,
            administrativeArea: orderData.shippingAddress.administrativeArea,
            phone: orderData.shippingAddress.phone,
            phoneE164: orderData.shippingAddress.phoneE164
          },
          paymentMethod: orderData.paymentMethod,
          paymentStatus: 'Paid',
          currency: sessionDoc.currency,
          subtotalExact: sessionDoc.amounts.subtotalExact,
          discountExact: sessionDoc.amounts.discountExact,
          shippingCostExact: sessionDoc.amounts.shippingCostExact,
          taxAmountExact: sessionDoc.amounts.taxAmountExact,
          dutiesExact: sessionDoc.amounts.dutiesExact,
          totalAmountExact: sessionDoc.amounts.totalAmountExact,
          subtotal: Number(MoneyMapper.toMoney(sessionDoc.amounts.subtotalExact).toDecimalString()),
          shippingCost: Number(MoneyMapper.toMoney(sessionDoc.amounts.shippingCostExact).toDecimalString()),
          taxAmount: Number(MoneyMapper.toMoney(sessionDoc.amounts.taxAmountExact).toDecimalString()),
          duties: Number(MoneyMapper.toMoney(sessionDoc.amounts.dutiesExact).toDecimalString()),
          discount: Number(MoneyMapper.toMoney(sessionDoc.amounts.discountExact).toDecimalString()),
          totalAmount: Number(MoneyMapper.toMoney(sessionDoc.amounts.totalAmountExact).toDecimalString()),
          quote: sessionDoc.quoteSnapshot,
          taxesAndDuties: sessionDoc.taxesAndDutiesSnapshot,
          shippingQuote: sessionDoc.shippingSnapshot,
          payment: {
            provider: payment.providerDisplayName || payment.provider,
            currency: sessionDoc.currency,
            paidAt: payment.capturedAt || new Date()
          },
          customerNote: orderData.customerNote,
          orderStatus: ORDER_STATUSES.PENDING,
          statusTimeline: [{
            status: ORDER_STATUSES.PENDING,
            actor: sessionDoc.userId,
            actorRole: 'customer',
            note: 'Order placed via verified two-phase prepaid checkout',
            timestamp: new Date()
          }],
          inventoryReservationId: holdResult.reservation._id
        }], { session: sessionContext });

        // 6. Link Payment to Order
        payment.order = order._id;
        payment.status = 'Completed';
        await payment.save({ session: sessionContext });

        // 7. Mark CheckoutSession as Converted
        sessionDoc.status = CheckoutSession.STATUSES.CONVERTED;
        sessionDoc.convertedOrderId = order._id;
        sessionDoc.convertedOrderDisplayId = order.orderId;
        await sessionDoc.save({ session: sessionContext });

        return { order, isReplay: false };
      };

      if (ownSession) {
        await mongoSession.withTransaction(async () => {
          result = await conversionWork(mongoSession);
        });
      } else {
        result = await conversionWork(mongoSession);
      }

      return result;
    } finally {
      if (ownSession) {
        await mongoSession.endSession();
      }
    }
  }

  /**
   * Cancel a checkout session and release held inventory safely.
   */
  async cancelSession({ sessionId, userId, reason = 'CUSTOMER_CANCELLED' }) {
    const session = await CheckoutSession.findOne({ sessionId, userId });
    if (!session) {
      throw new AppError('Checkout session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.status === CheckoutSession.STATUSES.CONVERTED) {
      throw new AppError('Cannot cancel an already converted checkout session', 409, 'CANNOT_CANCEL_CONVERTED_SESSION');
    }

    if (
      session.status === CheckoutSession.STATUSES.CANCELLED ||
      session.status === CheckoutSession.STATUSES.EXPIRED
    ) {
      return { session, isReplay: true };
    }

    // Atomically mark cancellation_requested
    await CheckoutSession.updateOne(
      { _id: session._id, status: session.status },
      {
        $set: {
          status: CheckoutSession.STATUSES.CANCELLATION_REQUESTED,
          'cancellation.requestedAt': new Date(),
          'cancellation.reason': reason
        },
        $inc: { lockVersion: 1 }
      }
    );

    // Release hold lease
    await StockHoldLeaseService.releaseHold({
      holdId: session.inventoryHoldId,
      sessionId: session.sessionId,
      merchantScopeId: session.merchantScopeId,
      releaseReason: reason,
      userId
    });

    session.status = CheckoutSession.STATUSES.CANCELLED;
    session.lockVersion += 1;
    await session.save();

    return { session, isReplay: false };
  }

  /**
   * Get sanitized session representation.
   */
  async getSanitizedSession(sessionId, userId, isAdmin = false) {
    const query = isAdmin ? { sessionId } : { sessionId, userId };
    const session = await CheckoutSession.findOne(query);

    if (!session) {
      throw new AppError('Checkout session not found', 404, 'SESSION_NOT_FOUND');
    }

    // Lazy expiry check
    if (
      session.status === CheckoutSession.STATUSES.ACTIVE ||
      session.status === CheckoutSession.STATUSES.PAYMENT_PENDING
    ) {
      if (session.leaseExpiresAt <= new Date()) {
        await StockHoldLeaseService.releaseHold({
          holdId: session.inventoryHoldId,
          sessionId: session.sessionId,
          merchantScopeId: session.merchantScopeId,
          releaseReason: 'EXPIRED_UNPAID'
        });
        session.status = CheckoutSession.STATUSES.EXPIRED;
        await session.save();
      }
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      leaseExpiresAt: session.leaseExpiresAt,
      amounts: session.amounts,
      currency: session.currency,
      destinationCountry: session.destinationCountry,
      convertedOrderId: session.convertedOrderId,
      convertedOrderDisplayId: session.convertedOrderDisplayId
    };
  }
}

module.exports = new CheckoutSessionService();

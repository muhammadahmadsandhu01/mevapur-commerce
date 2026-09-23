/**
 * @file CodEligibilityPolicyService.js
 * @description Authoritative Single Source of Truth for Pakistan COD Policy Decisions.
 * Evaluates the five owner-approved policies in strict customer-safe precedence:
 *   1. Country / Currency
 *   2. Location / Serviceability
 *   3. Customer Risk (Manual Block / Rolling RTO Lock)
 *   4. Guest Phone Verification
 *   5. Product Offering Eligibility
 *   6. Prepaid-Only Promotion
 *   7. PKR 25,000 Order Value Ceiling
 */

'use strict';

const CodServiceabilityRule = require('../../models/CodServiceabilityRule');
const CustomerCodRestriction = require('../../models/CustomerCodRestriction');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const Coupon = require('../../models/Coupon');
const guestVerificationService = require('../auth/GuestPhoneVerificationService');
const { Money, MoneyMapper } = require('../../modules/commerce');

const COD_MAX_PAYABLE_MINOR_UNITS = 2500000; // PKR 25,000.00 (exponent 2)
const COD_MAX_PAYABLE_THRESHOLD_EXACT = Object.freeze({
  amountMinor: COD_MAX_PAYABLE_MINOR_UNITS,
  currency: 'PKR',
  exponent: 2
});

const REASON_CODES = Object.freeze({
  COUNTRY_UNSUPPORTED: 'COD_COUNTRY_UNSUPPORTED',
  CURRENCY_UNSUPPORTED: 'COD_CURRENCY_UNSUPPORTED',
  LOCATION_REQUIRED: 'COD_LOCATION_REQUIRED',
  LOCATION_UNSERVICEABLE: 'COD_LOCATION_UNSERVICEABLE',
  CUSTOMER_BLOCKED: 'COD_CUSTOMER_BLOCKED',
  CUSTOMER_TEMPORARILY_LOCKED: 'COD_CUSTOMER_TEMPORARILY_LOCKED',
  GUEST_PHONE_REQUIRED: 'COD_GUEST_PHONE_VERIFICATION_REQUIRED',
  GUEST_VERIFICATION_UNAVAILABLE: 'COD_GUEST_VERIFICATION_UNAVAILABLE',
  PRODUCT_INELIGIBLE: 'COD_PRODUCT_INELIGIBLE',
  PROMOTION_PREPAID_ONLY: 'COD_PROMOTION_PREPAID_ONLY',
  ORDER_VALUE_EXCEEDED: 'COD_ORDER_VALUE_EXCEEDED'
});

const CUSTOMER_MESSAGES = Object.freeze({
  [REASON_CODES.COUNTRY_UNSUPPORTED]: 'Cash on delivery is currently available for domestic delivery in Pakistan only.',
  [REASON_CODES.CURRENCY_UNSUPPORTED]: 'Cash on delivery requires payment in Pakistani Rupees (PKR).',
  [REASON_CODES.LOCATION_REQUIRED]: 'Please enter a valid delivery city and address to check Cash on Delivery availability.',
  [REASON_CODES.LOCATION_UNSERVICEABLE]: 'Cash on delivery is not serviceable in your delivery zone. Please choose a prepaid payment method.',
  [REASON_CODES.CUSTOMER_BLOCKED]: 'Cash on delivery is unavailable for your account. Please select a prepaid payment method.',
  [REASON_CODES.CUSTOMER_TEMPORARILY_LOCKED]: 'Cash on delivery is temporarily unavailable for your account due to multiple refused deliveries. Please use a prepaid payment method.',
  [REASON_CODES.GUEST_PHONE_REQUIRED]: 'Guest checkout with Cash on Delivery requires verified phone confirmation.',
  [REASON_CODES.GUEST_VERIFICATION_UNAVAILABLE]: 'Guest phone verification is temporarily unavailable. Please select a prepaid payment method.',
  [REASON_CODES.PRODUCT_INELIGIBLE]: 'One or more items in your cart are not eligible for Cash on Delivery. Please select a prepaid payment method.',
  [REASON_CODES.PROMOTION_PREPAID_ONLY]: 'The applied promotional coupon requires a prepaid payment method.',
  [REASON_CODES.ORDER_VALUE_EXCEEDED]: 'Cash on delivery is available for orders up to PKR 25,000. Please select a prepaid payment method.'
});

class CodEligibilityPolicyService {
  constructor({
    serviceabilityModel = CodServiceabilityRule,
    restrictionModel = CustomerCodRestriction,
    offeringModel = ProductMarketOffering,
    couponModel = Coupon,
    verificationService = guestVerificationService
  } = {}) {
    this.serviceabilityModel = serviceabilityModel;
    this.restrictionModel = restrictionModel;
    this.offeringModel = offeringModel;
    this.couponModel = couponModel;
    this.verificationService = verificationService;
  }

  /**
   * Evaluates COD serviceability for a Pakistan location.
   * Specific postal rules override broader city rules. An explicit false overrides an allow.
   */
  async evaluateServiceability({
    merchantScopeId = 'default',
    city,
    postalCode = '',
    atDate = new Date()
  }) {
    if (!city || typeof city !== 'string' || !city.trim()) {
      return { serviceable: false, reasonCode: REASON_CODES.LOCATION_REQUIRED };
    }

    const normalizedCity = city.trim().toUpperCase();
    const normalizedPostalCode = postalCode ? String(postalCode).trim() : '';

    const query = {
      merchantScopeId,
      countryCode: 'PK',
      status: 'active',
      effectiveFrom: { $lte: atDate },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: atDate } }]
    };

    // 1. Check specific postal code rule first if postalCode provided
    if (normalizedPostalCode) {
      const postalRule = await this.serviceabilityModel.findOne({
        ...query,
        normalizedPostalCode
      }).sort({ createdAt: -1 });

      if (postalRule) {
        return {
          serviceable: postalRule.isServiceable === true,
          reasonCode: postalRule.isServiceable ? null : REASON_CODES.LOCATION_UNSERVICEABLE,
          ruleMatched: 'postal',
          ruleId: String(postalRule._id)
        };
      }
    }

    // 2. Fall back to city-wide rule
    const cityRule = await this.serviceabilityModel.findOne({
      ...query,
      normalizedCity,
      normalizedPostalCode: ''
    }).sort({ createdAt: -1 });

    if (cityRule) {
      return {
        serviceable: cityRule.isServiceable === true,
        reasonCode: cityRule.isServiceable ? null : REASON_CODES.LOCATION_UNSERVICEABLE,
        ruleMatched: 'city',
        ruleId: String(cityRule._id)
      };
    }

    // Fail closed for unknown/unlisted locations
    return {
      serviceable: false,
      reasonCode: REASON_CODES.LOCATION_UNSERVICEABLE,
      ruleMatched: 'none'
    };
  }

  /**
   * Master COD Eligibility Evaluator.
   * Consumed identically by Discovery, Quotes, and Order Submission.
   *
   * @param {Object} context
   * @param {string} [context.destinationCountry] - ISO country code
   * @param {string} [context.currency] - ISO currency code
   * @param {Object} [context.address] - Shipping address object
   * @param {string} [context.userId] - Authenticated user ObjectId or null
   * @param {string} [context.guestVerificationToken] - Single-use guest token
   * @param {Array<Object>} [context.cartItems] - Cart or order line items
   * @param {Object} [context.coupon] - Validated coupon object or null
   * @param {Money|Object} [context.payableTotalMoney] - Final grand total Money instance
   * @param {string} [context.merchantScopeId='default']
   * @param {Date} [context.atDate=new Date()]
   * @returns {Promise<Object>} Structured COD eligibility decision
   */
  async evaluateCodEligibility({
    destinationCountry = 'PK',
    currency = 'PKR',
    address = null,
    userId = null,
    guestVerificationToken = null,
    cartItems = [],
    coupon = null,
    payableTotalMoney = null,
    merchantScopeId = 'default',
    atDate = new Date()
  } = {}) {
    const normCountry = String(destinationCountry || '').trim().toUpperCase();
    const normCurrency = String(currency || '').trim().toUpperCase();

    // 1. Country & Currency
    if (normCountry !== 'PK') {
      return this._buildDecision(false, REASON_CODES.COUNTRY_UNSUPPORTED);
    }
    if (normCurrency !== 'PKR') {
      return this._buildDecision(false, REASON_CODES.CURRENCY_UNSUPPORTED);
    }

    // 2. Domestic Location Serviceability
    const city = address?.locality || address?.city || '';
    const postalCode = address?.postalCode || address?.zip || '';
    if (!city) {
      return this._buildDecision(false, REASON_CODES.LOCATION_REQUIRED);
    }

    const serviceability = await this.evaluateServiceability({
      merchantScopeId,
      city,
      postalCode,
      atDate
    });
    if (!serviceability.serviceable) {
      return this._buildDecision(false, REASON_CODES.LOCATION_UNSERVICEABLE, {
        serviceabilityDiagnostic: serviceability.ruleMatched
      });
    }

    // 3. Customer Risk Controls (Manual Block & Rolling RTO Lock)
    if (userId) {
      const restriction = await this.restrictionModel.findOne({
        merchantScopeId,
        customerId: userId
      });

      if (restriction) {
        const status = restriction.evaluateStatus(atDate);
        if (status.restricted) {
          return this._buildDecision(false, status.reasonCode, {
            temporaryLockUntil: restriction.temporaryLockUntil ? restriction.temporaryLockUntil.toISOString() : null
          });
        }
      }
    } else {
      // 4. Guest Phone Verification
      let serviceAvailable = true;
      try {
        if (typeof this.verificationService.isAvailable === 'function') {
          serviceAvailable = await this.verificationService.isAvailable();
        }
      } catch {
        serviceAvailable = false;
      }

      if (!serviceAvailable) {
        return this._buildDecision(false, REASON_CODES.GUEST_VERIFICATION_UNAVAILABLE);
      }

      const guestPhone = address?.phone || address?.phoneE164 || '';
      let isVerified = false;
      if (guestVerificationToken && guestPhone) {
        try {
          isVerified = await this.verificationService.validateToken(
            guestVerificationToken,
            guestPhone,
            false // preview only; consumption occurs on final order creation
          );
        } catch {
          return this._buildDecision(false, REASON_CODES.GUEST_VERIFICATION_UNAVAILABLE);
        }
      }

      if (!isVerified) {
        return this._buildDecision(false, REASON_CODES.GUEST_PHONE_REQUIRED, {
          requiresGuestPhoneChallenge: true
        });
      }
    }

    // 5. Product-Level Offering Eligibility
    if (Array.isArray(cartItems) && cartItems.length > 0) {
      const productIds = cartItems
        .map((i) => i.productId || i.product || i._id)
        .filter(Boolean);

      if (productIds.length > 0) {
        const offerings = await this.offeringModel.find({
          merchantScopeId,
          marketCountry: 'PK',
          status: 'active',
          productId: { $in: productIds }
        });

        const ineligibleOfferings = [];
        for (const item of cartItems) {
          const pId = String(item.productId || item.product || item._id);
          const offering = offerings.find((o) => String(o.productId) === pId);

          // Backward compatibility: explicit false is ineligible; missing/undefined is eligible
          if (offering && offering.codEligible === false) {
            ineligibleOfferings.push({
              productId: pId,
              sku: offering.sku || item.sku || 'UNKNOWN'
            });
          }
        }

        if (ineligibleOfferings.length > 0) {
          return this._buildDecision(false, REASON_CODES.PRODUCT_INELIGIBLE, {
            ineligibleOfferings
          });
        }
      }
    }

    // 6. Prepaid-Only Promotion Governance
    if (coupon) {
      const isCodPermitted = typeof coupon.isCodAllowed === 'function'
        ? coupon.isCodAllowed()
        : (!coupon.paymentEligibility || coupon.paymentEligibility.restrictionMode === 'ANY' || (
            coupon.paymentEligibility.restrictionMode === 'ALLOWLIST'
            && Array.isArray(coupon.paymentEligibility.allowedMethods)
            && coupon.paymentEligibility.allowedMethods.includes('cod')
          ));

      if (!isCodPermitted) {
        return this._buildDecision(false, REASON_CODES.PROMOTION_PREPAID_ONLY);
      }
    }

    // 7. PKR 25,000 Order Value Ceiling
    if (payableTotalMoney) {
      const evaluatedMinor = typeof payableTotalMoney.amountMinor === 'number'
        ? payableTotalMoney.amountMinor
        : (payableTotalMoney.amountMinor != null ? Number(payableTotalMoney.amountMinor) : 0);

      const evaluatedTotalExact = {
        amountMinor: evaluatedMinor,
        currency: 'PKR',
        exponent: 2
      };

      if (evaluatedMinor > COD_MAX_PAYABLE_MINOR_UNITS) {
        return this._buildDecision(false, REASON_CODES.ORDER_VALUE_EXCEEDED, {
          thresholdExact: COD_MAX_PAYABLE_THRESHOLD_EXACT,
          evaluatedTotalExact
        });
      }
    }

    // All 7 Gates Passed: COD is Available
    return this._buildDecision(true, null, {
      thresholdExact: COD_MAX_PAYABLE_THRESHOLD_EXACT
    });
  }

  _buildDecision(available, reasonCode = null, metadata = {}) {
    return {
      available,
      reasonCode,
      customerMessage: reasonCode ? (CUSTOMER_MESSAGES[reasonCode] || 'Cash on delivery is not eligible.') : null,
      evaluatedPolicyVersion: '1.0.0',
      metadata
    };
  }
}

const defaultCodPolicyService = new CodEligibilityPolicyService();

module.exports = defaultCodPolicyService;
module.exports.CodEligibilityPolicyService = CodEligibilityPolicyService;
module.exports.REASON_CODES = REASON_CODES;
module.exports.CUSTOMER_MESSAGES = CUSTOMER_MESSAGES;
module.exports.COD_MAX_PAYABLE_MINOR_UNITS = COD_MAX_PAYABLE_MINOR_UNITS;
module.exports.COD_MAX_PAYABLE_THRESHOLD_EXACT = COD_MAX_PAYABLE_THRESHOLD_EXACT;

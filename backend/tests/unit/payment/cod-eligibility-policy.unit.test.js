/**
 * @file cod-eligibility-policy.unit.test.js
 * @description Unit tests for CodEligibilityPolicyService.
 * Validates the 8-tier precedence order, exact integer boundary (PKR 25,000),
 * location serviceability specificity, customer risk evaluation, and legacy backward compatibility.
 */

'use strict';

const {
  CodEligibilityPolicyService,
  REASON_CODES,
  CUSTOMER_MESSAGES,
  COD_MAX_PAYABLE_MINOR_UNITS,
  COD_MAX_PAYABLE_THRESHOLD_EXACT
} = require('../../../services/payment/CodEligibilityPolicyService');

describe('CodEligibilityPolicyService Unit Tests', () => {
  let mockServiceabilityModel;
  let mockRestrictionModel;
  let mockOfferingModel;
  let mockCouponModel;
  let mockVerificationService;
  let service;

  const validAddress = {
    locality: 'Islamabad',
    city: 'Islamabad',
    postalCode: '44000',
    phone: '+923001234567'
  };

  const validTotalMoney = {
    amountMinor: 1500000, // PKR 15,000.00
    currency: 'PKR',
    exponent: 2
  };

  beforeEach(() => {
    mockServiceabilityModel = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          _id: 'rule-01',
          isServiceable: true,
          status: 'active'
        })
      })
    };

    mockRestrictionModel = {
      findOne: jest.fn().mockResolvedValue(null)
    };

    mockOfferingModel = {
      find: jest.fn().mockResolvedValue([
        { productId: 'prod-01', sku: 'SKU-01', codEligible: true },
        { productId: 'prod-02', sku: 'SKU-02', codEligible: true }
      ])
    };

    mockCouponModel = {};

    mockVerificationService = {
      isAvailable: jest.fn().mockReturnValue(true),
      validateToken: jest.fn().mockResolvedValue(true)
    };

    service = new CodEligibilityPolicyService({
      serviceabilityModel: mockServiceabilityModel,
      restrictionModel: mockRestrictionModel,
      offeringModel: mockOfferingModel,
      couponModel: mockCouponModel,
      verificationService: mockVerificationService
    });
  });

  describe('Precedence Order & Boundary Rules', () => {
    test('1. Fails closed with COD_COUNTRY_UNSUPPORTED for non-PK country', async () => {
      const result = await service.evaluateCodEligibility({
        destinationCountry: 'AE',
        currency: 'PKR',
        address: validAddress
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.COUNTRY_UNSUPPORTED);
      expect(result.customerMessage).toBe(CUSTOMER_MESSAGES[REASON_CODES.COUNTRY_UNSUPPORTED]);
    });

    test('2. Fails closed with COD_CURRENCY_UNSUPPORTED for non-PKR currency', async () => {
      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'USD',
        address: validAddress
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.CURRENCY_UNSUPPORTED);
      expect(result.customerMessage).toBe(CUSTOMER_MESSAGES[REASON_CODES.CURRENCY_UNSUPPORTED]);
    });

    test('3. Fails with COD_LOCATION_REQUIRED when city is missing', async () => {
      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: { postalCode: '44000' }
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.LOCATION_REQUIRED);
    });

    test('3b. Fails with COD_LOCATION_UNSERVICEABLE when area is not serviceable', async () => {
      mockServiceabilityModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(null) // No rule found -> fail closed
      });

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.LOCATION_UNSERVICEABLE);
    });

    test('4a. Fails with COD_CUSTOMER_BLOCKED when customer has active manual block', async () => {
      mockRestrictionModel.findOne = jest.fn().mockResolvedValue({
        evaluateStatus: jest.fn().mockReturnValue({
          restricted: true,
          reasonCode: REASON_CODES.CUSTOMER_BLOCKED,
          overrideActive: false
        })
      });

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-blocked-01'
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.CUSTOMER_BLOCKED);
    });

    test('4b. Fails with COD_CUSTOMER_TEMPORARILY_LOCKED when customer has active rolling lock', async () => {
      mockRestrictionModel.findOne = jest.fn().mockResolvedValue({
        temporaryLockUntil: new Date('2026-10-15T00:00:00.000Z'),
        evaluateStatus: jest.fn().mockReturnValue({
          restricted: true,
          reasonCode: REASON_CODES.CUSTOMER_TEMPORARILY_LOCKED,
          overrideActive: false
        })
      });

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-locked-01'
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.CUSTOMER_TEMPORARILY_LOCKED);
      expect(result.metadata.temporaryLockUntil).toBe('2026-10-15T00:00:00.000Z');
    });

    test('5a. Fails with COD_GUEST_VERIFICATION_UNAVAILABLE when verification service is unavailable', async () => {
      mockVerificationService.isAvailable = jest.fn().mockReturnValue(false);

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: null,
        guestVerificationToken: null
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.GUEST_VERIFICATION_UNAVAILABLE);
      expect(result.customerMessage).toBe(CUSTOMER_MESSAGES[REASON_CODES.GUEST_VERIFICATION_UNAVAILABLE]);
    });

    test('5b. Fails with COD_GUEST_PHONE_VERIFICATION_REQUIRED when guest lacks valid token', async () => {
      mockVerificationService.isAvailable = jest.fn().mockReturnValue(true);
      mockVerificationService.validateToken = jest.fn().mockResolvedValue(false);

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: null,
        guestVerificationToken: null
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.GUEST_PHONE_REQUIRED);
      expect(result.metadata.requiresGuestPhoneChallenge).toBe(true);
      // Validate token should not be called with consume = true
      expect(mockVerificationService.validateToken).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), true);
    });

    test('6. Fails with COD_PRODUCT_INELIGIBLE when cart item has codEligible: false', async () => {
      mockOfferingModel.find = jest.fn().mockResolvedValue([
        { productId: 'prod-01', sku: 'SKU-01', codEligible: true },
        { productId: 'prod-02', sku: 'SKU-02', codEligible: false }
      ]);

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-valid',
        cartItems: [
          { productId: 'prod-01' },
          { productId: 'prod-02' }
        ]
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.PRODUCT_INELIGIBLE);
      expect(result.metadata.ineligibleOfferings).toEqual([
        { productId: 'prod-02', sku: 'SKU-02' }
      ]);
    });

    test('7a. Fails with COD_PROMOTION_PREPAID_ONLY when coupon restricts to prepaid methods via isCodAllowed', async () => {
      const mockCoupon = {
        isCodAllowed: jest.fn().mockReturnValue(false)
      };

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-valid',
        coupon: mockCoupon
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.PROMOTION_PREPAID_ONLY);
    });

    test('7b. Fails with COD_PROMOTION_PREPAID_ONLY when coupon has paymentEligibility with restrictionMode ALLOWLIST excluding COD', async () => {
      const mockCoupon = {
        paymentEligibility: {
          restrictionMode: 'ALLOWLIST',
          allowedTenders: ['ONLINE_CARD', 'ONLINE_VA']
        }
      };

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-valid',
        coupon: mockCoupon
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.PROMOTION_PREPAID_ONLY);
    });

    test('8a. Passes when payable total is exactly at boundary (PKR 25,000.00)', async () => {
      const boundaryTotalMoney = {
        amountMinor: 2500000, // Exact 2,500,000 minor units
        currency: 'PKR',
        exponent: 2
      };

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-valid',
        payableTotalMoney: boundaryTotalMoney
      });

      expect(result.available).toBe(true);
      expect(result.reasonCode).toBeNull();
      expect(result.metadata.thresholdExact).toEqual(COD_MAX_PAYABLE_THRESHOLD_EXACT);
    });

    test('8b. Fails with COD_ORDER_VALUE_EXCEEDED when payable total exceeds boundary by 1 minor unit', async () => {
      const exceededTotalMoney = {
        amountMinor: 2500001, // 2,500,001 minor units (PKR 25,000.01)
        currency: 'PKR',
        exponent: 2
      };

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-valid',
        payableTotalMoney: exceededTotalMoney
      });

      expect(result.available).toBe(false);
      expect(result.reasonCode).toBe(REASON_CODES.ORDER_VALUE_EXCEEDED);
      expect(result.metadata.thresholdExact.amountMinor).toBe(COD_MAX_PAYABLE_MINOR_UNITS);
      expect(result.metadata.evaluatedTotalExact.amountMinor).toBe(2500001);
    });
  });

  describe('Legacy Backward Compatibility', () => {
    test('Offering without codEligible field defaults to eligible', async () => {
      mockOfferingModel.find = jest.fn().mockResolvedValue([
        { productId: 'prod-legacy', sku: 'SKU-LEGACY' } // codEligible is undefined
      ]);

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-valid',
        cartItems: [{ productId: 'prod-legacy' }],
        payableTotalMoney: validTotalMoney
      });

      expect(result.available).toBe(true);
      expect(result.reasonCode).toBeNull();
    });

    test('Coupon without paymentEligibility defaults to ANY (allows COD)', async () => {
      const legacyCoupon = {
        code: 'LEGACY10',
        discount: 10
        // paymentEligibility is undefined
      };

      const result = await service.evaluateCodEligibility({
        destinationCountry: 'PK',
        currency: 'PKR',
        address: validAddress,
        userId: 'user-valid',
        coupon: legacyCoupon,
        payableTotalMoney: validTotalMoney
      });

      expect(result.available).toBe(true);
      expect(result.reasonCode).toBeNull();
    });
  });

  describe('Location Specificity Precedence', () => {
    test('Specific postal rule takes precedence over city rule', async () => {
      // First call is postal query, second is city query
      mockServiceabilityModel.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue({
          _id: 'postal-rule-44000',
          isServiceable: true,
          normalizedPostalCode: '44000'
        })
      });

      const result = await service.evaluateServiceability({
        city: 'Islamabad',
        postalCode: '44000'
      });

      expect(result.serviceable).toBe(true);
      expect(result.ruleMatched).toBe('postal');
      expect(result.ruleId).toBe('postal-rule-44000');
    });

    test('City rule applies when postal rule not found', async () => {
      let callCount = 0;
      mockServiceabilityModel.findOne = jest.fn().mockImplementation(() => {
        callCount++;
        return {
          sort: jest.fn().mockResolvedValue(
            callCount === 1 ? null : {
              _id: 'city-rule-islamabad',
              isServiceable: true,
              normalizedCity: 'ISLAMABAD'
            }
          )
        };
      });

      const result = await service.evaluateServiceability({
        city: 'Islamabad',
        postalCode: '99999'
      });

      expect(result.serviceable).toBe(true);
      expect(result.ruleMatched).toBe('city');
      expect(result.ruleId).toBe('city-rule-islamabad');
    });
  });
});

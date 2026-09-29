'use strict';

const OrderService = require('../../../services/order/OrderService');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const PaymentWebhookProcessor = require('../../../services/payment/webhooks/PaymentWebhookProcessor');
const paymentStateMachine = require('../../../services/payment/stateMachine/PaymentStateMachine');
const AuditService = require('../../../services/AuditService');
const { ORDER_STATUSES } = require('../../../constants/orderConstants');
const { PAYMENT_STATUSES } = require('../../../constants/paymentConstants');
const ERROR_CODES = require('../../../constants/errorCodes');
const defaultCodSettingsService = require('../../../services/settings/CodSettingsService');
const { normalizeCityCanonical } = require('../../../services/settings/CodSettingsService');
const { CodEligibilityPolicyService } = require('../../../services/payment/CodEligibilityPolicyService');

const makeQuery = (result) => {
  const query = Promise.resolve(result);
  query.session = jest.fn().mockResolvedValue(result);
  return query;
};

describe('Batch 1: State Machine & COD Security Guards', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1.1 PaymentWebhookProcessor - Prevent Paid Mutation on Cancelled Orders', () => {
    test('does NOT set paymentStatus to Paid when order is already CANCELLED, and logs cancelled_captured_liability', async () => {
      const mockOrder = {
        _id: '6ab9a576a7f6b4c734456111',
        orderId: 'HZ-20260930-000111',
        currency: 'PKR',
        orderStatus: ORDER_STATUSES.CANCELLED,
        paymentStatus: 'Pending',
        user: 'user_111',
        statusTimeline: [],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockPayment = {
        _id: '6ab9a576a7f6b4c734456222',
        order: mockOrder._id,
        status: PAYMENT_STATUSES.AUTHORIZED,
        amount: 5000,
        amountExact: { amountMinor: 500000, currency: 'PKR' },
        currency: 'PKR',
        provider: 'stripe',
        paidAmount: 0,
        providerPaymentId: 'pi_111',
        capabilitySnapshot: { environment: 'sandbox', accountAlias: 'default' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Payment, 'findOne').mockReturnValue(makeQuery(mockPayment));
      jest.spyOn(Order, 'findById').mockReturnValue(makeQuery(mockOrder));
      jest.spyOn(paymentStateMachine, 'canTransition').mockReturnValue(true);
      jest.spyOn(paymentStateMachine, 'apply').mockImplementation(() => {});
      jest.spyOn(AuditService, 'log').mockResolvedValue(true);

      const result = await PaymentWebhookProcessor.processPaymentEvent({
        claimedEvent: {
          provider: 'stripe',
          environment: 'sandbox',
          accountAlias: 'default',
          eventType: 'payment_intent.succeeded',
          providerEventId: 'evt_stripe_111',
          providerPaymentId: 'pi_111',
          amountMinor: 500000,
          currency: 'PKR',
          eventData: {}
        },
        now: new Date()
      });

      expect(result).toBe('cancelled_captured_liability');
      expect(mockOrder.paymentStatus).toBe('Pending'); // Must NOT be mutated to Paid
      expect(mockOrder.orderStatus).toBe(ORDER_STATUSES.CANCELLED);
      expect(mockOrder.save).toHaveBeenCalled();
      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'cancelled_captured_liability',
          status: 'ALERT',
          metadata: expect.objectContaining({
            orderId: 'HZ-20260930-000111',
            providerPaymentId: 'pi_111'
          })
        })
      );
    });

    test('sets paymentStatus to Paid when order is NOT cancelled', async () => {
      const mockOrder = {
        _id: '6ab9a576a7f6b4c734456333',
        orderId: 'HZ-20260930-000333',
        currency: 'PKR',
        orderStatus: ORDER_STATUSES.CONFIRMED,
        paymentStatus: 'Pending',
        user: 'user_333',
        statusTimeline: [],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockPayment = {
        _id: '6ab9a576a7f6b4c734456444',
        order: mockOrder._id,
        status: PAYMENT_STATUSES.AUTHORIZED,
        amount: 7500,
        amountExact: { amountMinor: 750000, currency: 'PKR' },
        currency: 'PKR',
        provider: 'stripe',
        paidAmount: 0,
        providerPaymentId: 'pi_222',
        capabilitySnapshot: { environment: 'sandbox', accountAlias: 'default' },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(Payment, 'findOne').mockReturnValue(makeQuery(mockPayment));
      jest.spyOn(Order, 'findById').mockReturnValue(makeQuery(mockOrder));
      jest.spyOn(paymentStateMachine, 'canTransition').mockReturnValue(true);
      jest.spyOn(paymentStateMachine, 'apply').mockImplementation(() => {});

      const result = await PaymentWebhookProcessor.processPaymentEvent({
        claimedEvent: {
          provider: 'stripe',
          environment: 'sandbox',
          accountAlias: 'default',
          eventType: 'payment_intent.succeeded',
          providerEventId: 'evt_stripe_222',
          providerPaymentId: 'pi_222',
          amountMinor: 750000,
          currency: 'PKR',
          eventData: {}
        },
        now: new Date()
      });

      expect(result).toBe('processed');
      expect(mockOrder.paymentStatus).toBe('Paid');
      expect(mockOrder.save).toHaveBeenCalled();
    });
  });

  describe('1.2 OrderService.markCodPaid - Guard Against Cancelled Orders', () => {
    test('strictly throws 400 INVALID_STATE when attempting to mark a cancelled COD order as paid', async () => {
      const mockOrder = {
        _id: '6ab9a576a7f6b4c734456555',
        orderId: 'HZ-20260930-000555',
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        orderStatus: ORDER_STATUSES.CANCELLED,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (cb) => cb({}));
      jest.spyOn(Order, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockOrder)
      });

      await expect(
        OrderService.markCodPaid({
          reference: 'HZ-20260930-000555',
          actor: { id: 'admin_1', role: 'admin' },
          autoDeliver: true
        })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: ERROR_CODES.INVALID_STATE,
          message: 'Cannot mark cancelled order as paid'
        })
      );
    });
  });

  describe('1.3 OrderService.transitionOrder - Prevent Fulfillment of Unpaid Prepaid Orders', () => {
    test('rejects transition to Shipped when non-COD order paymentStatus is Pending', async () => {
      const mockOrder = {
        _id: '6ab9a576a7f6b4c734456666',
        orderId: 'HZ-20260930-000666',
        paymentMethod: 'stripe',
        paymentStatus: 'Pending',
        orderStatus: ORDER_STATUSES.PROCESSING,
        statusTimeline: [],
        adminNotes: [],
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (cb) => cb({}));
      jest.spyOn(Order, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockOrder)
      });

      await expect(
        OrderService.transitionOrder({
          reference: 'HZ-20260930-000666',
          actor: { id: 'admin_1', role: 'admin' },
          orderStatus: ORDER_STATUSES.SHIPPED,
          adminNote: 'Dispatching parcel'
        })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'UNPAID_ORDER_FULFILLMENT_BLOCKED',
          message: 'Cannot fulfill or ship unpaid order'
        })
      );
    });

    test('rejects transition to Delivered when non-COD order paymentStatus is Failed', async () => {
      const mockOrder = {
        _id: '6ab9a576a7f6b4c734456777',
        orderId: 'HZ-20260930-000777',
        paymentMethod: 'stripe',
        paymentStatus: 'Failed',
        orderStatus: ORDER_STATUSES.SHIPPED,
        statusTimeline: [],
        adminNotes: [],
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (cb) => cb({}));
      jest.spyOn(Order, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockOrder)
      });

      await expect(
        OrderService.transitionOrder({
          reference: 'HZ-20260930-000777',
          actor: { id: 'admin_1', role: 'admin' },
          orderStatus: ORDER_STATUSES.DELIVERED,
          adminNote: 'Confirming delivery'
        })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'UNPAID_ORDER_FULFILLMENT_BLOCKED',
          message: 'Cannot fulfill or ship unpaid order'
        })
      );
    });

    test('allows transition to Shipped when non-COD order paymentStatus is Paid', async () => {
      const mockOrder = {
        _id: '6ab9a576a7f6b4c734456888',
        orderId: 'HZ-20260930-000888',
        paymentMethod: 'stripe',
        paymentStatus: 'Paid',
        orderStatus: ORDER_STATUSES.PROCESSING,
        statusTimeline: [],
        adminNotes: [],
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (cb) => cb({}));
      jest.spyOn(Order, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockOrder)
      });

      const result = await OrderService.transitionOrder({
        reference: 'HZ-20260930-000888',
        actor: { id: 'admin_1', role: 'admin' },
        orderStatus: ORDER_STATUSES.SHIPPED,
        adminNote: 'Dispatched after confirmed payment'
      });

      expect(result.order.orderStatus).toBe(ORDER_STATUSES.SHIPPED);
      expect(mockOrder.save).toHaveBeenCalled();
    });

    test('allows transition to Shipped for COD orders even if paymentStatus is Pending', async () => {
      const mockOrder = {
        _id: '6ab9a576a7f6b4c734456999',
        orderId: 'HZ-20260930-000999',
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        orderStatus: ORDER_STATUSES.PROCESSING,
        statusTimeline: [],
        adminNotes: [],
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (cb) => cb({}));
      jest.spyOn(Order, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockOrder)
      });

      const result = await OrderService.transitionOrder({
        reference: 'HZ-20260930-000999',
        actor: { id: 'admin_1', role: 'admin' },
        orderStatus: ORDER_STATUSES.SHIPPED,
        adminNote: 'Dispatching COD order'
      });

      expect(result.order.orderStatus).toBe(ORDER_STATUSES.SHIPPED);
      expect(mockOrder.save).toHaveBeenCalled();
    });
  });

  describe('1.4 Canonical City Normalization & COD Fraud Bypass Prevention', () => {
    test('normalizeCityCanonical collapses internal spaces, strips punctuation, and uppercases', () => {
      expect(normalizeCityCanonical('  karachi  ')).toBe('KARACHI');
      expect(normalizeCityCanonical('Dera   Ghazi   Khan')).toBe('DERA GHAZI KHAN');
      expect(normalizeCityCanonical('Karachi.')).toBe('KARACHI');
      expect(normalizeCityCanonical('Lahore - Cantt')).toBe('LAHORE CANTT');
      expect(normalizeCityCanonical('Mirpur Khas, Sindh')).toBe('MIRPUR KHAS SINDH');
      expect(normalizeCityCanonical('')).toBe('');
      expect(normalizeCityCanonical(null)).toBe('');
      expect(normalizeCityCanonical(undefined)).toBe('');
      expect(normalizeCityCanonical(12345)).toBe('');
    });

    test('isCityDisallowed catches disallowed cities even with whitespace or punctuation manipulation', async () => {
      jest.spyOn(defaultCodSettingsService, 'getDisallowedCities').mockResolvedValue([
        'Dera Ghazi Khan',
        'Quetta',
        'Mirpur Khas'
      ]);

      // Exact match
      expect(await defaultCodSettingsService.isCityDisallowed('Dera Ghazi Khan')).toBe(true);
      // Multi-space bypass attempt
      expect(await defaultCodSettingsService.isCityDisallowed('Dera   Ghazi   Khan')).toBe(true);
      // Punctuation bypass attempt
      expect(await defaultCodSettingsService.isCityDisallowed('Dera Ghazi Khan.')).toBe(true);
      expect(await defaultCodSettingsService.isCityDisallowed('Quetta-')).toBe(true);
      expect(await defaultCodSettingsService.isCityDisallowed('Mirpur Khas.')).toBe(true);
      // Case variation
      expect(await defaultCodSettingsService.isCityDisallowed('dErA gHaZi kHaN')).toBe(true);
      // Allowed city
      expect(await defaultCodSettingsService.isCityDisallowed('Islamabad')).toBe(false);
    });

    test('CodEligibilityPolicyService evaluates serviceability using canonical city normalization', async () => {
      const mockServiceabilityModel = {
        findOne: jest.fn().mockReturnValue({
          sort: jest.fn().mockImplementation((_opts) => {
            return Promise.resolve(null);
          })
        })
      };

      const mockCodSettings = {
        isCityDisallowed: jest.fn().mockImplementation(async (city) => {
          return normalizeCityCanonical(city) === 'FAISALABAD';
        })
      };

      const service = new CodEligibilityPolicyService({
        serviceabilityModel: mockServiceabilityModel,
        restrictionModel: { findOne: jest.fn().mockResolvedValue(null) },
        offeringModel: { find: jest.fn().mockResolvedValue([]) },
        couponModel: {},
        verificationService: {},
        codSettingsService: mockCodSettings
      });

      // User tries multi-space evasion: "Faisalabad  "
      const result = await service.evaluateServiceability({
        city: 'Faisalabad  ',
        destinationCountry: 'PK'
      });

      expect(result.serviceable).toBe(false);
      expect(result.reasonCode).toBe('COD_CITY_DISALLOWED');
    });
  });
});

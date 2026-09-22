/**
 * @file order-delivery-outcome.unit.test.js
 * @description Unit tests for OrderDeliveryOutcomeService.
 * Validates transactional outcome recording, rolling 90-day refusal threshold,
 * automatic 30-day lock derivation, idempotency, and error handling.
 */

'use strict';

const mongoose = require('mongoose');
const {
  OrderDeliveryOutcomeService,
  ROLLING_WINDOW_DAYS,
  LOCK_DURATION_DAYS,
  QUALIFYING_THRESHOLD_COUNT
} = require('../../../services/order/OrderDeliveryOutcomeService');
const CodDeliveryOutcome = require('../../../models/CodDeliveryOutcome');

describe('OrderDeliveryOutcomeService Unit Tests', () => {
  let mockOrderModel;
  let mockOutcomeModel;
  let mockRestrictionModel;
  let service;
  let mockSession;

  const customerId = new mongoose.Types.ObjectId('66f000000000000000000002');
  const orderId = new mongoose.Types.ObjectId('66f000000000000000000099');
  const publicOrderId = 'ORD-2026-9999';

  beforeEach(() => {
    mockSession = {
      withTransaction: jest.fn(async (fn) => fn()),
      endSession: jest.fn().mockResolvedValue()
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);

    mockOrderModel = {
      findOne: jest.fn().mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: orderId,
          orderId: publicOrderId,
          user: customerId
        })
      })
    };

    function MockOutcomeInstance(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
    }

    mockOutcomeModel = MockOutcomeInstance;
    mockOutcomeModel.ALL_COD_OUTCOMES = CodDeliveryOutcome.ALL_COD_OUTCOMES;
    mockOutcomeModel.QUALIFYING_COD_OUTCOMES = CodDeliveryOutcome.QUALIFYING_COD_OUTCOMES;
    mockOutcomeModel.isQualifyingOutcome = CodDeliveryOutcome.isQualifyingOutcome;
    mockOutcomeModel.findOne = jest.fn().mockResolvedValue(null);
    mockOutcomeModel.countDocuments = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(0)
    });

    function MockRestrictionInstance(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
    }
    mockRestrictionModel = MockRestrictionInstance;
    mockRestrictionModel.findOne = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(null)
    });

    service = new OrderDeliveryOutcomeService({
      orderModel: mockOrderModel,
      outcomeModel: mockOutcomeModel,
      restrictionModel: mockRestrictionModel
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Validation & Idempotency', () => {
    it('throws error when orderId is missing', async () => {
      await expect(
        service.recordDeliveryOutcome({ outcomeCode: 'DELIVERED' })
      ).rejects.toThrow('Order ID is required to record delivery outcome');
    });

    it('throws error when outcomeCode is invalid', async () => {
      await expect(
        service.recordDeliveryOutcome({ orderId, outcomeCode: 'INVALID_CODE' })
      ).rejects.toThrow("Invalid delivery outcome code: 'INVALID_CODE'");
    });

    it('returns existing event when eventId is duplicated', async () => {
      const existing = { _id: 'outcome-existing', eventId: 'EVT-DUP-01' };
      mockOutcomeModel.findOne.mockResolvedValueOnce(existing);

      const result = await service.recordDeliveryOutcome({
        orderId,
        outcomeCode: 'DELIVERY_SUCCESSFUL',
        eventId: 'EVT-DUP-01'
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.outcome).toBe(existing);
      expect(mockOrderModel.findOne).not.toHaveBeenCalled();
    });

    it('throws error when order is not found', async () => {
      mockOrderModel.findOne.mockReturnValueOnce({
        session: jest.fn().mockResolvedValue(null)
      });

      await expect(
        service.recordDeliveryOutcome({ orderId, outcomeCode: 'DELIVERY_SUCCESSFUL' })
      ).rejects.toThrow(`Order not found for ID: ${orderId}`);
    });
  });

  describe('Delivery Event Recording', () => {
    it('records DELIVERY_SUCCESSFUL event without triggering rolling threshold check', async () => {
      const result = await service.recordDeliveryOutcome({
        orderId,
        outcomeCode: 'DELIVERY_SUCCESSFUL',
        metadata: { courierName: 'TCS', trackingNumber: 'TCS-12345' }
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.outcome.outcomeCode).toBe('DELIVERY_SUCCESSFUL');
      expect(result.outcome.metadata.courierName).toBe('TCS');
      expect(result.restriction).toBeNull();
      expect(result.qualifyingCount).toBe(0);
      expect(mockOutcomeModel.countDocuments).not.toHaveBeenCalled();
    });

    it('evaluates rolling count for qualifying outcome COD_REFUSED_BY_CUSTOMER', async () => {
      mockOutcomeModel.countDocuments.mockReturnValueOnce({
        session: jest.fn().mockResolvedValue(1)
      });

      const result = await service.recordDeliveryOutcome({
        orderId,
        outcomeCode: 'COD_REFUSED_BY_CUSTOMER',
        metadata: { refusalReason: 'Customer not at home' }
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.outcome.outcomeCode).toBe('COD_REFUSED_BY_CUSTOMER');
      expect(result.qualifyingCount).toBe(1);
      expect(result.restriction).toBeNull();
      expect(mockRestrictionModel.findOne).not.toHaveBeenCalled();
    });

    it('locks customer for 30 days when qualifyingCount reaches threshold', async () => {
      const now = new Date('2026-09-23T12:00:00Z');
      mockOutcomeModel.countDocuments.mockReturnValueOnce({
        session: jest.fn().mockResolvedValue(QUALIFYING_THRESHOLD_COUNT)
      });

      const result = await service.recordDeliveryOutcome({
        orderId,
        outcomeCode: 'COD_RETURN_TO_ORIGIN',
        occurredAt: now
      });

      expect(result.qualifyingCount).toBe(QUALIFYING_THRESHOLD_COUNT);
      expect(result.restriction).toBeDefined();
      expect(result.restriction.temporaryLockReasonCode).toBe('COD_CUSTOMER_TEMPORARILY_LOCKED');
      expect(result.restriction.automaticLockSource).toBe('ROLLING_RTO_THRESHOLD');

      const expectedLockTime = new Date(now.getTime() + LOCK_DURATION_DAYS * 24 * 60 * 60 * 1000);
      expect(result.restriction.temporaryLockUntil.getTime()).toBe(expectedLockTime.getTime());
    });

    it('updates existing restriction when customer already has a record', async () => {
      const now = new Date('2026-09-23T12:00:00Z');
      const existingRestriction = {
        merchantScopeId: 'default',
        customerId,
        temporaryLockUntil: new Date('2026-09-30T00:00:00Z'),
        lockVersion: 1,
        save: jest.fn().mockResolvedValue(true)
      };

      mockOutcomeModel.countDocuments.mockReturnValueOnce({
        session: jest.fn().mockResolvedValue(3)
      });
      mockRestrictionModel.findOne.mockReturnValueOnce({
        session: jest.fn().mockResolvedValue(existingRestriction)
      });

      const result = await service.recordDeliveryOutcome({
        orderId,
        outcomeCode: 'COD_REFUSED_BY_CUSTOMER',
        occurredAt: now
      });

      expect(result.restriction).toBe(existingRestriction);
      expect(existingRestriction.lockVersion).toBe(2);
      expect(existingRestriction.temporaryLockReasonCode).toBe('COD_CUSTOMER_TEMPORARILY_LOCKED');
      expect(existingRestriction.save).toHaveBeenCalled();
    });

    it('handles guest order without customerId without failing', async () => {
      mockOrderModel.findOne.mockReturnValueOnce({
        session: jest.fn().mockResolvedValue({
          _id: orderId,
          orderId: publicOrderId,
          user: null
        })
      });

      const result = await service.recordDeliveryOutcome({
        orderId,
        outcomeCode: 'COD_REFUSED_BY_CUSTOMER'
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.outcome.outcomeCode).toBe('COD_REFUSED_BY_CUSTOMER');
      expect(result.restriction).toBeNull();
      expect(mockOutcomeModel.countDocuments).not.toHaveBeenCalled();
    });
  });
});

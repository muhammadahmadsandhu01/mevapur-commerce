/**
 * @file delivery-promise.unit.test.js
 * @description Unit tests for DeliveryPromiseService.
 */

const DeliveryPromiseService = require('../../services/shipping/DeliveryPromiseService');

describe('Phase 6D-3: DeliveryPromiseService Unit Tests', () => {
  let service;

  beforeEach(() => {
    service = new DeliveryPromiseService();
  });

  describe('1. Business Days Arithmetic', () => {
    it('1.1 adds business days skipping Saturday and Sunday', () => {
      // Wednesday, 2026-09-16
      const startDate = new Date('2026-09-16T10:00:00.000Z');
      // +3 business days -> Thu (17), Fri (18), Mon (21)
      const result = service.addBusinessDays(startDate, 3);
      expect(result.getUTCDay()).toBe(1); // Monday
      expect(result.toISOString().slice(0, 10)).toBe('2026-09-21');
    });

    it('1.2 adds 0 days returning the same day', () => {
      const startDate = new Date('2026-09-16T10:00:00.000Z');
      const result = service.addBusinessDays(startDate, 0);
      expect(result.toISOString().slice(0, 10)).toBe('2026-09-16');
    });
  });

  describe('2. Order Cutoff & Dispatch Calculation', () => {
    it('2.1 schedules same-day dispatch for order placed before cutoff (e.g. 10:00 AM before 14:00 cutoff)', () => {
      const orderDate = '2026-09-16T10:00:00.000Z'; // 10:00 UTC
      const promise = service.calculatePromise({
        orderDate,
        cutoffTime: '14:00',
        timezone: 'UTC',
        deliveryMinDays: 2,
        deliveryMaxDays: 4
      });

      expect(promise.isSameDayDispatch).toBe(true);
      expect(promise.isPastCutoff).toBe(false);
      expect(promise.dispatchDate.slice(0, 10)).toBe('2026-09-16');
      expect(promise.minDeliveryDate.slice(0, 10)).toBe('2026-09-18'); // Wed + 2 business days = Fri (18)
      expect(promise.maxDeliveryDate.slice(0, 10)).toBe('2026-09-22'); // Wed + 4 business days = Tue (22)
      expect(promise.promiseText).toBe('2-4 business days');
    });

    it('2.2 rolls dispatch to next business day for order placed after cutoff (e.g. 15:30 PM after 14:00 cutoff)', () => {
      const orderDate = '2026-09-16T15:30:00.000Z'; // 15:30 UTC
      const promise = service.calculatePromise({
        orderDate,
        cutoffTime: '14:00',
        timezone: 'UTC',
        deliveryMinDays: 2,
        deliveryMaxDays: 4
      });

      expect(promise.isSameDayDispatch).toBe(false);
      expect(promise.isPastCutoff).toBe(true);
      expect(promise.dispatchDate.slice(0, 10)).toBe('2026-09-17'); // Thu (17)
      expect(promise.minDeliveryDate.slice(0, 10)).toBe('2026-09-21'); // Thu + 2 business days = Mon (21)
      expect(promise.maxDeliveryDate.slice(0, 10)).toBe('2026-09-23'); // Thu + 4 business days = Wed (23)
    });

    it('2.3 handles weekend order placement with Monday dispatch', () => {
      const orderDate = '2026-09-19T11:00:00.000Z'; // Saturday
      const promise = service.calculatePromise({
        orderDate,
        cutoffTime: '14:00',
        timezone: 'UTC',
        deliveryMinDays: 2,
        deliveryMaxDays: 3
      });

      expect(promise.dispatchDate.slice(0, 10)).toBe('2026-09-21'); // Monday (21)
      expect(promise.minDeliveryDate.slice(0, 10)).toBe('2026-09-23'); // Mon + 2 = Wed (23)
      expect(promise.maxDeliveryDate.slice(0, 10)).toBe('2026-09-24'); // Mon + 3 = Thu (24)
    });
  });

  describe('3. Remote Area Extensions', () => {
    it('3.1 applies remote extension days when destination is remote', () => {
      const orderDate = '2026-09-16T10:00:00.000Z';
      const promise = service.calculatePromise({
        orderDate,
        cutoffTime: '14:00',
        timezone: 'UTC',
        deliveryMinDays: 2,
        deliveryMaxDays: 4,
        isRemote: true,
        remoteDeliveryMinDays: 5,
        remoteDeliveryMaxDays: 8
      });

      expect(promise.isRemote).toBe(true);
      expect(promise.minDays).toBe(5);
      expect(promise.maxDays).toBe(8);
      expect(promise.promiseText).toBe('5-8 business days');
    });
  });
});

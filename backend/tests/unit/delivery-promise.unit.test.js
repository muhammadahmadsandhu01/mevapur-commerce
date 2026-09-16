/**
 * @file delivery-promise.unit.test.js
 * @description Unit tests for DeliveryPromiseService covering timezone-aware cutoff,
 * working-day arithmetic, DST transitions, processing envelopes, and fail-closed validation.
 */

const DeliveryPromiseService = require('../../services/shipping/DeliveryPromiseService');

describe('Phase 6D-3: DeliveryPromiseService Unit Tests', () => {
  let service;

  beforeEach(() => {
    service = new DeliveryPromiseService();
  });

  describe('1. Business Days Arithmetic', () => {
    it('1.1 adds business days skipping Saturday and Sunday by default', () => {
      // Wednesday, 2026-09-16
      const startDate = new Date('2026-09-16T12:00:00.000Z');
      // +3 business days -> Thu (17), Fri (18), Mon (21)
      const result = service.addBusinessDays(startDate, 3);
      expect(result.getUTCDay()).toBe(1); // Monday
      expect(result.toISOString().slice(0, 10)).toBe('2026-09-21');
    });

    it('1.2 adds 0 days returning the same day', () => {
      const startDate = new Date('2026-09-16T12:00:00.000Z');
      const result = service.addBusinessDays(startDate, 0);
      expect(result.toISOString().slice(0, 10)).toBe('2026-09-16');
    });

    it('1.3 supports custom working week including Saturday', () => {
      // Friday, 2026-09-18
      const startDate = new Date('2026-09-18T12:00:00.000Z');
      // +2 days with Mon-Sat [1..6] -> Sat (19), Mon (21)
      const result = service.addBusinessDays(startDate, 2, [1, 2, 3, 4, 5, 6]);
      expect(result.toISOString().slice(0, 10)).toBe('2026-09-21');
    });
  });

  describe('2. Order Cutoff & Dispatch Calculation', () => {
    it('2.1 schedules same-day dispatch for order placed before cutoff (10:00 AM before 14:00 cutoff)', () => {
      const orderDate = '2026-09-16T10:00:00.000Z'; // 10:00 UTC (Wed)
      const promise = service.calculatePromise({
        orderDate,
        processingCutoffLocal: '14:00',
        originTimeZone: 'UTC',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 1,
        deliveryMinDays: 2,
        deliveryMaxDays: 4
      });

      expect(promise.isSameDayDispatch).toBe(true);
      expect(promise.isPastCutoff).toBe(false);
      expect(promise.dispatchMinDate.slice(0, 10)).toBe('2026-09-16'); // Wed (16)
      expect(promise.dispatchMaxDate.slice(0, 10)).toBe('2026-09-17'); // Thu (17)
      expect(promise.minDeliveryDate.slice(0, 10)).toBe('2026-09-18'); // Wed + 2 business days = Fri (18)
      expect(promise.maxDeliveryDate.slice(0, 10)).toBe('2026-09-23'); // Thu + 4 business days = Wed (23)
      expect(promise.promiseText).toBe('2-4 business days');
    });

    it('2.2 rolls dispatch to next business day for order placed exactly at cutoff (14:00 at 14:00 cutoff)', () => {
      const orderDate = '2026-09-16T14:00:00.000Z'; // 14:00 UTC (Wed)
      const promise = service.calculatePromise({
        orderDate,
        processingCutoffLocal: '14:00',
        originTimeZone: 'UTC',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 1,
        deliveryMinDays: 2,
        deliveryMaxDays: 4
      });

      expect(promise.isSameDayDispatch).toBe(false);
      expect(promise.isPastCutoff).toBe(true);
      expect(promise.dispatchMinDate.slice(0, 10)).toBe('2026-09-17'); // Thu (17)
      expect(promise.dispatchMaxDate.slice(0, 10)).toBe('2026-09-18'); // Fri (18)
      expect(promise.minDeliveryDate.slice(0, 10)).toBe('2026-09-21'); // Thu + 2 = Mon (21)
      expect(promise.maxDeliveryDate.slice(0, 10)).toBe('2026-09-24'); // Fri + 4 = Thu (24)
    });

    it('2.3 rolls dispatch to next business day for order placed after cutoff (15:30 PM after 14:00 cutoff)', () => {
      const orderDate = '2026-09-16T15:30:00.000Z'; // 15:30 UTC (Wed)
      const promise = service.calculatePromise({
        orderDate,
        processingCutoffLocal: '14:00',
        originTimeZone: 'UTC',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 1,
        deliveryMinDays: 2,
        deliveryMaxDays: 4
      });

      expect(promise.isSameDayDispatch).toBe(false);
      expect(promise.isPastCutoff).toBe(true);
      expect(promise.dispatchMinDate.slice(0, 10)).toBe('2026-09-17'); // Thu (17)
      expect(promise.minDeliveryDate.slice(0, 10)).toBe('2026-09-21'); // Thu + 2 = Mon (21)
      expect(promise.maxDeliveryDate.slice(0, 10)).toBe('2026-09-24'); // Fri + 4 = Thu (24)
    });

    it('2.4 handles weekend order placement with Monday processing start', () => {
      const orderDate = '2026-09-19T11:00:00.000Z'; // Saturday
      const promise = service.calculatePromise({
        orderDate,
        processingCutoffLocal: '14:00',
        originTimeZone: 'UTC',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 1,
        deliveryMinDays: 2,
        deliveryMaxDays: 3
      });

      expect(promise.isPastCutoff).toBe(false);
      expect(promise.dispatchMinDate.slice(0, 10)).toBe('2026-09-21'); // Monday (21)
      expect(promise.dispatchMaxDate.slice(0, 10)).toBe('2026-09-22'); // Tuesday (22)
      expect(promise.minDeliveryDate.slice(0, 10)).toBe('2026-09-23'); // Mon + 2 = Wed (23)
      expect(promise.maxDeliveryDate.slice(0, 10)).toBe('2026-09-25'); // Tue + 3 = Fri (25)
    });
  });

  describe('3. Timezone & DST Correctness', () => {
    it('3.1 calculates cutoff in Asia/Karachi (UTC+5) correctly', () => {
      // 08:30 UTC = 13:30 in Karachi (before 14:00 cutoff)
      const beforeCutoff = '2026-09-16T08:30:00.000Z';
      const promise1 = service.calculatePromise({
        orderDate: beforeCutoff,
        originLocation: { timeZone: 'Asia/Karachi' },
        shippingRule: {
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          deliveryMinDays: 2,
          deliveryMaxDays: 4
        }
      });

      expect(promise1.isPastCutoff).toBe(false);
      expect(promise1.dispatchMinDate.slice(0, 10)).toBe('2026-09-16'); // Wed

      // 09:30 UTC = 14:30 in Karachi (after 14:00 cutoff)
      const afterCutoff = '2026-09-16T09:30:00.000Z';
      const promise2 = service.calculatePromise({
        orderDate: afterCutoff,
        originLocation: { timeZone: 'Asia/Karachi' },
        shippingRule: {
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          deliveryMinDays: 2,
          deliveryMaxDays: 4
        }
      });

      expect(promise2.isPastCutoff).toBe(true);
      expect(promise2.dispatchMinDate.slice(0, 10)).toBe('2026-09-17'); // Thu
    });

    it('3.2 calculates cutoff in Europe/London under British Summer Time (BST = UTC+1)', () => {
      // July date (BST): 12:30 UTC = 13:30 London (before 14:00 cutoff)
      const summerBefore = '2026-07-15T12:30:00.000Z';
      const p1 = service.calculatePromise({
        orderDate: summerBefore,
        originTimeZone: 'Europe/London',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 0,
        deliveryMinDays: 1,
        deliveryMaxDays: 2
      });
      expect(p1.isPastCutoff).toBe(false);
      expect(p1.dispatchMinDate.slice(0, 10)).toBe('2026-07-15');

      // July date (BST): 13:30 UTC = 14:30 London (after 14:00 cutoff)
      const summerAfter = '2026-07-15T13:30:00.000Z';
      const p2 = service.calculatePromise({
        orderDate: summerAfter,
        originTimeZone: 'Europe/London',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 0,
        deliveryMinDays: 1,
        deliveryMaxDays: 2
      });
      expect(p2.isPastCutoff).toBe(true);
      expect(p2.dispatchMinDate.slice(0, 10)).toBe('2026-07-16');
    });

    it('3.3 calculates cutoff in America/New_York under Daylight Saving Time (EDT = UTC-4)', () => {
      // 17:30 UTC = 13:30 New York (before 14:00 cutoff)
      const nyBefore = '2026-06-15T17:30:00.000Z';
      const p1 = service.calculatePromise({
        orderDate: nyBefore,
        originTimeZone: 'America/New_York',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 1,
        deliveryMinDays: 2,
        deliveryMaxDays: 3
      });
      expect(p1.isPastCutoff).toBe(false);
      expect(p1.dispatchMinDate.slice(0, 10)).toBe('2026-06-15');

      // 18:30 UTC = 14:30 New York (after 14:00 cutoff)
      const nyAfter = '2026-06-15T18:30:00.000Z';
      const p2 = service.calculatePromise({
        orderDate: nyAfter,
        originTimeZone: 'America/New_York',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 1,
        deliveryMinDays: 2,
        deliveryMaxDays: 3
      });
      expect(p2.isPastCutoff).toBe(true);
      expect(p2.dispatchMinDate.slice(0, 10)).toBe('2026-06-16');
    });
  });

  describe('4. Custom Working Days & Processing Envelopes', () => {
    it('4.1 handles custom 6-day working week (Mon-Sat)', () => {
      // Friday 15:00 (after cutoff) with Mon-Sat working week
      const fridayAfternoon = '2026-09-18T15:00:00.000Z';
      const p = service.calculatePromise({
        orderDate: fridayAfternoon,
        originTimeZone: 'UTC',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5, 6],
        processingMinBusinessDays: 0,
        processingMaxBusinessDays: 1,
        deliveryMinDays: 2,
        deliveryMaxDays: 3
      });

      expect(p.dispatchMinDate.slice(0, 10)).toBe('2026-09-19'); // Saturday (19)
      expect(p.dispatchMaxDate.slice(0, 10)).toBe('2026-09-21'); // Monday (21, skipping Sunday)
      expect(p.minDeliveryDate.slice(0, 10)).toBe('2026-09-22'); // Sat + 2 (Mon, Tue) = Tuesday (22)
      expect(p.maxDeliveryDate.slice(0, 10)).toBe('2026-09-24'); // Mon + 3 (Tue, Wed, Thu) = Thursday (24)
    });

    it('4.2 applies processing business day envelopes (minProc: 1, maxProc: 2)', () => {
      // Wednesday 10:00 AM (before cutoff)
      const wedMorning = '2026-09-16T10:00:00.000Z';
      const p = service.calculatePromise({
        orderDate: wedMorning,
        originTimeZone: 'UTC',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 1,
        processingMaxBusinessDays: 2,
        deliveryMinDays: 2,
        deliveryMaxDays: 3
      });

      expect(p.dispatchMinDate.slice(0, 10)).toBe('2026-09-17'); // Thursday (Wed + 1)
      expect(p.dispatchMaxDate.slice(0, 10)).toBe('2026-09-18'); // Friday (Wed + 2)
      expect(p.minDeliveryDate.slice(0, 10)).toBe('2026-09-21'); // Thu + 2 = Mon (21)
      expect(p.maxDeliveryDate.slice(0, 10)).toBe('2026-09-23'); // Fri + 3 = Wed (23)
    });
  });

  describe('5. Remote Area Windows & Fallback Invariants', () => {
    it('5.1 applies explicit remote transit days when present', () => {
      const orderDate = '2026-09-16T10:00:00.000Z';
      const promise = service.calculatePromise({
        orderDate,
        processingCutoffLocal: '14:00',
        originTimeZone: 'UTC',
        workingDays: [1, 2, 3, 4, 5],
        deliveryMinDays: 2,
        deliveryMaxDays: 4,
        isRemote: true,
        remoteDeliveryMinDays: 5,
        remoteDeliveryMaxDays: 8
      });

      expect(promise.isRemote).toBe(true);
      expect(promise.deliveryMinDays).toBe(5);
      expect(promise.deliveryMaxDays).toBe(8);
      expect(promise.promiseText).toBe('5-8 business days');
    });

    it('5.2 uses normal governed transit days without arbitrary offset when remote fields are null', () => {
      const orderDate = '2026-09-16T10:00:00.000Z';
      const promise = service.calculatePromise({
        orderDate,
        processingCutoffLocal: '14:00',
        originTimeZone: 'UTC',
        workingDays: [1, 2, 3, 4, 5],
        deliveryMinDays: 2,
        deliveryMaxDays: 4,
        isRemote: true,
        remoteDeliveryMinDays: null,
        remoteDeliveryMaxDays: null
      });

      expect(promise.isRemote).toBe(true);
      expect(promise.deliveryMinDays).toBe(2);
      expect(promise.deliveryMaxDays).toBe(4);
      expect(promise.promiseText).toBe('2-4 business days');
    });
  });

  describe('6. Strict Fail-Closed Validation', () => {
    it('6.1 fails closed on invalid or missing timezone', () => {
      expect(() => service.calculatePromise({
        orderDate: '2026-09-16T10:00:00.000Z',
        originTimeZone: 'Invalid/NonExistent_Zone',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5]
      })).toThrow(/Invalid or missing origin timezone/);

      expect(() => service.calculatePromise({
        orderDate: '2026-09-16T10:00:00.000Z',
        originTimeZone: '',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5]
      })).toThrow(/Invalid or missing origin timezone/);
    });

    it('6.2 fails closed on malformed processing cutoff format', () => {
      expect(() => service.calculatePromise({
        orderDate: '2026-09-16T10:00:00.000Z',
        originTimeZone: 'UTC',
        processingCutoffLocal: '25:00',
        workingDays: [1, 2, 3, 4, 5]
      })).toThrow(/Invalid processing cutoff time format/);
    });

    it('6.3 fails closed on invalid or empty workingDays', () => {
      expect(() => service.calculatePromise({
        orderDate: '2026-09-16T10:00:00.000Z',
        originTimeZone: 'UTC',
        processingCutoffLocal: '14:00',
        workingDays: []
      })).toThrow(/Invalid or missing workingDays/);

      expect(() => service.calculatePromise({
        orderDate: '2026-09-16T10:00:00.000Z',
        originTimeZone: 'UTC',
        processingCutoffLocal: '14:00',
        workingDays: [0, 8]
      })).toThrow(/Invalid or missing workingDays/);
    });

    it('6.4 fails closed on inverted or negative processing days', () => {
      expect(() => service.calculatePromise({
        orderDate: '2026-09-16T10:00:00.000Z',
        originTimeZone: 'UTC',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5],
        processingMinBusinessDays: 3,
        processingMaxBusinessDays: 1
      })).toThrow(/Invalid processing business days range/);
    });
  });
});

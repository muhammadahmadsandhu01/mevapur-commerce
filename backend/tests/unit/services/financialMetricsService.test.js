const FinancialMetricsService = require('../../../services/order/FinancialMetricsService');

describe('FinancialMetricsService Unit Tests', () => {
  describe('roundMoney', () => {
    it('accurately rounds to 2 decimal places using deterministic half-up rounding', () => {
      expect(FinancialMetricsService.roundMoney(10.555)).toBe(10.56);
      expect(FinancialMetricsService.roundMoney(10.554)).toBe(10.55);
      expect(FinancialMetricsService.roundMoney(100)).toBe(100);
      expect(FinancialMetricsService.roundMoney(0)).toBe(0);
      expect(FinancialMetricsService.roundMoney(null)).toBe(0);
      expect(FinancialMetricsService.roundMoney(undefined)).toBe(0);
      expect(FinancialMetricsService.roundMoney(NaN)).toBe(0);
      expect(FinancialMetricsService.roundMoney('invalid')).toBe(0);
    });

    it('avoids floating point subtraction artifacts', () => {
      const floatDiff = 0.3 - 0.2; // 0.09999999999999998 in standard JS IEEE 754
      expect(FinancialMetricsService.roundMoney(floatDiff)).toBe(0.1);
    });
  });

  describe('parseDateRange', () => {
    it('creates deterministic half-open interval [start, endExclusive) for YYYY-MM-DD dates', () => {
      const { start, end } = FinancialMetricsService.parseDateRange('2026-01-01', '2026-01-31');
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(0); // Jan
      expect(start.getDate()).toBe(1);

      // End must be advanced to next day at 00:00:00 for half-open interval
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(1); // Feb
      expect(end.getDate()).toBe(1);
      expect(end.getHours()).toBe(0);
      expect(end.getMinutes()).toBe(0);
    });

    it('defaults to 30 days interval when dates are omitted', () => {
      const { start, end } = FinancialMetricsService.parseDateRange(null, null, 30);
      expect(start instanceof Date).toBe(true);
      expect(end instanceof Date).toBe(true);
      expect(end.getTime() - start.getTime()).toBeGreaterThanOrEqual(29 * 24 * 60 * 60 * 1000);
    });
  });

  describe('computeGrowthRate', () => {
    it('calculates positive increase and negative change correctly', () => {
      expect(FinancialMetricsService.computeGrowthRate(150, 100)).toBe(50.0);
      expect(FinancialMetricsService.computeGrowthRate(80, 100)).toBe(-20.0);
      expect(FinancialMetricsService.computeGrowthRate(100, 100)).toBe(0.0);
    });

    it('returns -100.0% when activity drops from positive baseline to zero', () => {
      expect(FinancialMetricsService.computeGrowthRate(0, 100)).toBe(-100.0);
    });

    it('returns null for undefined growth when previous baseline is zero or negative', () => {
      expect(FinancialMetricsService.computeGrowthRate(500, 0)).toBeNull();
      expect(FinancialMetricsService.computeGrowthRate(0, 0)).toBeNull();
      expect(FinancialMetricsService.computeGrowthRate(500, -10)).toBeNull();
    });

    it('returns null for non-numeric or invalid inputs', () => {
      expect(FinancialMetricsService.computeGrowthRate(null, 100)).toBeNull();
      expect(FinancialMetricsService.computeGrowthRate(100, null)).toBeNull();
      expect(FinancialMetricsService.computeGrowthRate(undefined, undefined)).toBeNull();
    });
  });

  describe('date interval helpers', () => {
    it('getTodayInterval returns today 00:00 to tomorrow 00:00', () => {
      const { start, end } = FinancialMetricsService.getTodayInterval();
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('getThisMonthInterval and getLastMonthInterval are non-overlapping adjacent periods', () => {
      const thisMonth = FinancialMetricsService.getThisMonthInterval();
      const lastMonth = FinancialMetricsService.getLastMonthInterval();

      expect(lastMonth.end.getTime()).toBe(thisMonth.start.getTime());
      expect(lastMonth.start.getTime()).toBeLessThan(lastMonth.end.getTime());
      expect(thisMonth.start.getTime()).toBeLessThan(thisMonth.end.getTime());
    });
  });
});

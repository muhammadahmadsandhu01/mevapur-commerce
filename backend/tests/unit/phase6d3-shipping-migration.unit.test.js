/**
 * @file phase6d3-shipping-migration.unit.test.js
 * @description Unit tests for Phase 6D-3 shipping governance migration utilities and invariant checks.
 */

const { findIndexMatch, inspectPreflightAnomalies } = require('../../scripts/migrations/phase6d3-shipping-governance');

describe('Phase 6D-3: Shipping Migration Utilities Unit Tests', () => {
  describe('1. Index Matching Helper', () => {
    const existingIndexes = [
      { key: { merchantScopeId: 1, version: 1 }, name: 'merchantScopeId_1_version_1' },
      { key: { merchantScopeId: 1, status: 1 }, name: 'custom_status_idx' }
    ];

    it('1.1 matches index by exact key specification', () => {
      const match = findIndexMatch(existingIndexes, { merchantScopeId: 1, version: 1 });
      expect(match).toBeDefined();
      expect(match.name).toBe('merchantScopeId_1_version_1');
    });

    it('1.2 matches index by exact name', () => {
      const match = findIndexMatch(existingIndexes, { dummy: 1 }, 'custom_status_idx');
      expect(match).toBeDefined();
      expect(match.name).toBe('custom_status_idx');
    });

    it('1.3 returns null when index is not found', () => {
      const match = findIndexMatch(existingIndexes, { nonexistent: 1 }, 'no_such_idx');
      expect(match).toBeNull();
    });
  });

  describe('2. Preflight Anomaly Inspection', () => {
    it('2.1 reports zero anomalies for clean shipping rules', async () => {
      const validRules = [
        {
          ruleId: 'valid-rule-1',
          originCountry: 'PK',
          destinationCountry: 'AE',
          deliveryMinDays: 2,
          deliveryMaxDays: 5,
          weightBands: [
            { minWeightGrams: 0, maxWeightGrams: 1000 }
          ]
        }
      ];

      const anomalies = await inspectPreflightAnomalies(validRules);
      expect(anomalies).toEqual([]);
    });

    it('2.2 detects invalid destination country codes', async () => {
      const invalidRules = [
        {
          ruleId: 'bad-country',
          originCountry: 'PK',
          destinationCountry: 'XYZ',
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(invalidRules);
      expect(anomalies.some((a) => a.type === 'INVALID_DESTINATION_COUNTRY')).toBe(true);
    });

    it('2.3 detects inverted delivery transit days', async () => {
      const invalidRules = [
        {
          ruleId: 'bad-days',
          originCountry: 'PK',
          destinationCountry: 'AE',
          deliveryMinDays: 5,
          deliveryMaxDays: 2
        }
      ];

      const anomalies = await inspectPreflightAnomalies(invalidRules);
      expect(anomalies.some((a) => a.type === 'INVERTED_DELIVERY_DAYS')).toBe(true);
    });

    it('2.4 detects duplicate rule IDs within same configuration', async () => {
      const duplicateRules = [
        { ruleId: 'dup-1', originCountry: 'PK', destinationCountry: 'AE', deliveryMinDays: 1, deliveryMaxDays: 3 },
        { ruleId: 'dup-1', originCountry: 'PK', destinationCountry: 'GB', deliveryMinDays: 1, deliveryMaxDays: 3 }
      ];

      const anomalies = await inspectPreflightAnomalies(duplicateRules);
      expect(anomalies.some((a) => a.type === 'DUPLICATE_RULE_ID')).toBe(true);
    });

    it('2.5 detects inverted weight bands', async () => {
      const badBandRules = [
        {
          ruleId: 'bad-band',
          originCountry: 'PK',
          destinationCountry: 'AE',
          deliveryMinDays: 2,
          deliveryMaxDays: 4,
          weightBands: [
            { minWeightGrams: 2000, maxWeightGrams: 500 }
          ]
        }
      ];

      const anomalies = await inspectPreflightAnomalies(badBandRules);
      expect(anomalies.some((a) => a.type === 'INVALID_WEIGHT_BAND_BOUNDS')).toBe(true);
    });
  });
});

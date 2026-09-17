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
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
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
          serviceCode: 'standard',
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

    it('2.6 detects missing or malformed processingCutoffLocal', async () => {
      const badCutoff = [
        {
          ruleId: 'bad-cutoff-1',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          processingCutoffLocal: '25:99',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        },
        {
          ruleId: 'bad-cutoff-2',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'GB',
          processingCutoffLocal: '',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(badCutoff);
      const cutoffAnomalies = anomalies.filter((a) => a.type === 'INVALID_PROCESSING_CUTOFF');
      expect(cutoffAnomalies.length).toBe(2);
    });

    it('2.7 detects missing, empty, or invalid workingDays', async () => {
      const badWorkingDays = [
        {
          ruleId: 'bad-wd-empty',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          processingCutoffLocal: '15:00',
          workingDays: [],
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        },
        {
          ruleId: 'bad-wd-invalid-val',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'GB',
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 8],
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(badWorkingDays);
      const wdAnomalies = anomalies.filter((a) => a.type === 'INVALID_WORKING_DAYS');
      expect(wdAnomalies.length).toBe(2);
    });

    it('2.8 detects duplicate workingDays', async () => {
      const dupWorkingDays = [
        {
          ruleId: 'dup-wd',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(dupWorkingDays);
      expect(anomalies.some((a) => a.type === 'DUPLICATE_WORKING_DAYS')).toBe(true);
    });

    it('2.9 detects inverted processingMinBusinessDays and processingMaxBusinessDays', async () => {
      const invertedProc = [
        {
          ruleId: 'inv-proc',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 3,
          processingMaxBusinessDays: 1,
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(invertedProc);
      expect(anomalies.some((a) => a.type === 'INVERTED_PROCESSING_DAYS')).toBe(true);
    });

    it('2.10 detects missing serviceCode', async () => {
      const missingService = [
        {
          ruleId: 'missing-srv',
          originCountry: 'PK',
          destinationCountry: 'AE',
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(missingService);
      expect(anomalies.some((a) => a.type === 'MISSING_SERVICE_CODE')).toBe(true);
    });

    it('2.11 detects missing or invalid exact money structure', async () => {
      const badMoney = [
        {
          ruleId: 'bad-money-1',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          baseRateExact: { amountMinor: 'not-a-number', currency: 'AED', exponent: 2 },
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(badMoney);
      expect(anomalies.some((a) => a.type === 'INVALID_EXACT_MONEY')).toBe(true);
    });

    it('2.12 detects rule currency not enabled in merchant profile', async () => {
      const unenabledCurrencyConfig = {
        version: 1,
        merchantScopeId: 'default',
        merchantProfile: {
          enabledCountries: ['AE'],
          enabledCurrencies: ['PKR', 'USD']
        },
        shippingRules: [
          {
            ruleId: 'unenabled-curr-rule',
            serviceCode: 'standard',
            originCountry: 'PK',
            destinationCountry: 'AE',
            baseRateExact: { amountMinor: '3500', currency: 'EUR', exponent: 2 },
            processingCutoffLocal: '15:00',
            workingDays: [1, 2, 3, 4, 5],
            deliveryMinDays: 1,
            deliveryMaxDays: 3
          }
        ]
      };

      const anomalies = await inspectPreflightAnomalies(unenabledCurrencyConfig);
      expect(anomalies.some((a) => a.type === 'CURRENCY_NOT_ENABLED')).toBe(true);
    });

    it('2.13 detects currency/exponent mismatch between baseRateExact and other money fields', async () => {
      const mismatchedMoney = [
        {
          ruleId: 'mismatched-money-rule',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          baseRateExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
          remoteRateExact: { amountMinor: '2000', currency: 'USD', exponent: 2 },
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(mismatchedMoney);
      expect(anomalies.some((a) => a.type === 'MONEY_CURRENCY_EXPONENT_MISMATCH')).toBe(true);
    });

    it('2.14 detects overlapping weight bands', async () => {
      const overlappingBands = [
        {
          ruleId: 'overlap-bands-rule',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 3,
          weightBands: [
            { minWeightGrams: 0, maxWeightGrams: 2000 },
            { minWeightGrams: 1500, maxWeightGrams: 5000 }
          ]
        }
      ];

      const anomalies = await inspectPreflightAnomalies(overlappingBands);
      expect(anomalies.some((a) => a.type === 'OVERLAPPING_WEIGHT_BANDS')).toBe(true);
    });

    it('2.15 detects enabled destination without matching rule', async () => {
      const missingDestConfig = {
        version: 1,
        merchantScopeId: 'default',
        merchantProfile: {
          enabledCountries: ['PK', 'AE', 'GB'],
          enabledCurrencies: ['PKR', 'AED', 'GBP']
        },
        shippingRules: [
          {
            ruleId: 'rule-pk',
            serviceCode: 'standard',
            originCountry: 'PK',
            destinationCountry: 'PK',
            processingCutoffLocal: '15:00',
            workingDays: [1, 2, 3, 4, 5],
            deliveryMinDays: 1,
            deliveryMaxDays: 3
          },
          {
            ruleId: 'rule-ae',
            serviceCode: 'standard',
            originCountry: 'PK',
            destinationCountry: 'AE',
            processingCutoffLocal: '15:00',
            workingDays: [1, 2, 3, 4, 5],
            deliveryMinDays: 1,
            deliveryMaxDays: 3
          }
        ]
      };

      const anomalies = await inspectPreflightAnomalies(missingDestConfig);
      const destAnomalies = anomalies.filter((a) => a.type === 'MISSING_MATCHING_RULE_FOR_ENABLED_DESTINATION');
      expect(destAnomalies.length).toBe(1);
      expect(destAnomalies[0].country).toBe('GB');
    });

    it('2.16 detects negative amountMinor in exact money structure', async () => {
      const negativeMoney = [
        {
          ruleId: 'negative-money-rule',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          baseRateExact: { amountMinor: '-5000', currency: 'AED', exponent: 2 },
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(negativeMoney);
      expect(anomalies.some((a) => a.type === 'INVALID_EXACT_MONEY')).toBe(true);
    });

    it('2.17 detects fractional amountMinor in exact money structure', async () => {
      const fractionalMoney = [
        {
          ruleId: 'fractional-money-rule',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          baseRateExact: { amountMinor: '50.55', currency: 'AED', exponent: 2 },
          deliveryMinDays: 1,
          deliveryMaxDays: 3
        }
      ];

      const anomalies = await inspectPreflightAnomalies(fractionalMoney);
      expect(anomalies.some((a) => a.type === 'INVALID_EXACT_MONEY')).toBe(true);
    });
  });

  describe('3. Rollback Ownership Verification and Safety', () => {
    const { runRollback } = require('../../scripts/migrations/phase6d3-shipping-governance');
    const MigrationState = require('../../models/MigrationState');

    it('3.1 refuses rollback when MigrationState ownership cannot be proven', async () => {
      jest.spyOn(MigrationState, 'findOne').mockResolvedValueOnce(null);

      const mockDb = {
        listCollections: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) })
      };

      await expect(runRollback(mockDb, { target: 'staging' }))
        .rejects
        .toThrow(/Rollback refused: Rollout ownership cannot be proven/);
    });

    it('3.2 drops verified migration-owned indexes and never drops _id_', async () => {
      const mockState = {
        createdIndexes: [
          'commerceconfigurationversions.unique_tenant_config_version',
          'commerceconfigurationversions._id_'
        ],
        status: 'APPLIED',
        save: jest.fn().mockResolvedValue(true)
      };
      jest.spyOn(MigrationState, 'findOne').mockResolvedValueOnce(mockState);

      const mockDropIndex = jest.fn().mockResolvedValue(true);
      const mockDb = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ name: 'commerceconfigurationversions' }])
        }),
        collection: jest.fn().mockReturnValue({
          indexes: jest.fn().mockResolvedValue([
            { name: 'unique_tenant_config_version', key: { merchantScopeId: 1, version: 1 } },
            { name: '_id_', key: { _id: 1 } }
          ]),
          dropIndex: mockDropIndex
        })
      };

      const result = await runRollback(mockDb, { target: 'staging' });
      expect(result.dropped).toEqual([{ name: 'unique_tenant_config_version', collection: 'commerceconfigurationversions' }]);
      expect(result.skipped).toEqual([{ name: '_id_', reason: 'PRIMARY_INDEX' }]);
      expect(mockDropIndex).toHaveBeenCalledWith('unique_tenant_config_version');
      expect(mockDropIndex).not.toHaveBeenCalledWith('_id_');
      expect(mockState.status).toBe('ROLLED_BACK');
    });
  });
});

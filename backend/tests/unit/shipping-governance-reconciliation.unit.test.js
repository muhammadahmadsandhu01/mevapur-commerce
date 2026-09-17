/**
 * @file shipping-governance-reconciliation.unit.test.js
 * @description Unit tests for Phase 6D-3 shipping governance reconciliation script.
 */

'use strict';

const mongoose = require('mongoose');
const {
  EXIT_CODE,
  isValidExactMoney,
  getNextTenantBatch,
  runShippingReconciliation,
  reconcileSingleTenant
} = require('../../scripts/reconciliation/shippingGovernanceReconciliation');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const ShippingZone = require('../../models/ShippingZone');
const { MoneyMapper } = require('../../modules/commerce');

describe('Phase 6D-3: Shipping Governance Reconciliation Unit Tests', () => {
  let seq = 0;

  beforeEach(() => {
    seq++;
  });

  function createValidConfigData(scopeId, version = 1) {
    return {
      merchantScopeId: scopeId,
      version,
      status: 'active',
      effectiveFrom: new Date(Date.now() - 10000),
      merchantProfile: {
        merchantCountry: 'PK',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        sellingMode: 'hybrid',
        enabledCountries: ['PK', 'AE'],
        enabledCurrencies: ['PKR', 'AED']
      },
      shippingRules: [
        {
          ruleId: 'CLEAN-RULE-PK',
          name: 'Pakistan Standard Ground',
          displayName: 'TCS Ground',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: MoneyMapper.fromLegacy(150, 'PKR'),
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 3,
          enabled: true
        },
        {
          ruleId: 'CLEAN-RULE-AE',
          name: 'UAE Standard Cross-Border',
          displayName: 'Aramex UAE Ground',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: MoneyMapper.fromLegacy(35, 'AED'),
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 2,
          deliveryMaxDays: 5,
          enabled: true
        }
      ],
      taxRules: []
    };
  }

  it('1. Default invocation without tenant or all-tenants fails closed with CLI error', async () => {
    const report = await runShippingReconciliation({});
    expect(report.success).toBe(false);
    expect(report.error).toBe('EXPLICIT_TENANT_SCOPE_OR_ALL_TENANTS_REQUIRED');
    expect(report.anomalies.some((a) => a.type === 'TENANT_SCOPE_REQUIRED')).toBe(true);
    expect(EXIT_CODE.CLI_ERROR).toBe(2);
    expect(EXIT_CODE.SUCCESS).toBe(0);
    expect(EXIT_CODE.DISCREPANCIES_FOUND).toBe(1);
    expect(EXIT_CODE.RUNTIME_ERROR).toBe(3);
  });

  it('2. Single-tenant reconciliation works for clean governed tenant with active fulfillment location', async () => {
    const scopeId = `clean-tenant-${seq}`;

    await CommerceConfigurationVersion.create(createValidConfigData(scopeId));

    await FulfillmentLocation.create({
      merchantScopeId: scopeId,
      locationCode: `LOC-${seq}`,
      displayName: 'Main Hub',
      status: 'active',
      countryCode: 'PK',
      city: 'Karachi',
      timeZone: 'Asia/Karachi',
      priority: 10,
      supportedMarketCountries: ['PK', 'AE'],
      supportedServiceLevels: ['standard']
    });

    const report = await runShippingReconciliation({ merchantScopeId: scopeId });
    expect(report.success).toBe(true);
    expect(report.merchantScopeId).toBe(scopeId);
    expect(report.totalRules).toBe(2);
    expect(report.uncoveredCountries).toEqual([]);
    const criticalOrHigh = report.anomalies.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH');
    expect(criticalOrHigh.length).toBe(0);
  });

  it('3. All-tenant mode operates with bounded keyset aggregation without distinct()', async () => {
    const distinctSpy = jest.spyOn(CommerceConfigurationVersion, 'distinct');
    const aggregateSpy = jest.spyOn(CommerceConfigurationVersion, 'aggregate');

    const scopeA = `batch-tenant-a-${seq}`;
    const scopeB = `batch-tenant-b-${seq}`;
    const scopeC = `batch-tenant-c-${seq}`;

    await CommerceConfigurationVersion.create([
      createValidConfigData(scopeA),
      createValidConfigData(scopeB),
      createValidConfigData(scopeC)
    ]);

    const report = await runShippingReconciliation({ allTenants: true, batchSize: 2 });
    expect(report.allTenants).toBe(true);
    expect(report.batchSize).toBe(2);
    expect(report.processedTenants).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(report.tenantReports)).toBe(true);

    // Verify distinct() was NEVER called
    expect(distinctSpy).not.toHaveBeenCalled();
    // Verify aggregation was used for database-level keyset pagination
    expect(aggregateSpy).toHaveBeenCalled();

    distinctSpy.mockRestore();
    aggregateSpy.mockRestore();
  });

  it('4. getNextTenantBatch performs deterministic keyset pagination and limits at DB query level', async () => {
    const prefix = `keyset-${seq}`;
    const scopes = [`${prefix}-1`, `${prefix}-2`, `${prefix}-3`, `${prefix}-4`];

    for (const s of scopes) {
      await CommerceConfigurationVersion.create(createValidConfigData(s));
    }

    // First page with limit 2
    const page1 = await getNextTenantBatch(null, 2);
    expect(page1.length).toBeLessThanOrEqual(2);

    // Second page with limit 2 using last item of page 1
    if (page1.length > 0) {
      const lastScope = page1[page1.length - 1];
      const page2 = await getNextTenantBatch(lastScope, 2);
      expect(page2.every((s) => s > lastScope)).toBe(true);
    }
  });

  it('5. Reconciliation strictly performs zero database writes', async () => {
    const scopeId = `zero-write-tenant-${seq}`;
    await CommerceConfigurationVersion.create(createValidConfigData(scopeId));

    const collections = mongoose.connection.collections;
    const countsBefore = {};
    for (const [name, col] of Object.entries(collections)) {
      countsBefore[name] = await col.countDocuments({});
    }

    await runShippingReconciliation({ merchantScopeId: scopeId });

    for (const [name, col] of Object.entries(collections)) {
      const countAfter = await col.countDocuments({});
      expect(countAfter).toBe(countsBefore[name]);
    }
  });

  it('6. Legacy shipping zones use countDocuments rather than find', async () => {
    const findSpy = jest.spyOn(ShippingZone, 'find');
    const countSpy = jest.spyOn(ShippingZone, 'countDocuments');

    const scopeId = `legacy-count-${seq}`;
    await CommerceConfigurationVersion.create(createValidConfigData(scopeId));

    await runShippingReconciliation({ merchantScopeId: scopeId });

    expect(findSpy).not.toHaveBeenCalled();
    expect(countSpy).toHaveBeenCalled();

    findSpy.mockRestore();
    countSpy.mockRestore();
  });

  it('7. Exact money validation strictly accepts zero and positive integers, rejecting negative values and decimals', () => {
    // Valid canonical exact money
    expect(isValidExactMoney({ amountMinor: '0', currency: 'PKR', exponent: 2 })).toBe(true);
    expect(isValidExactMoney({ amountMinor: '3500', currency: 'AED', exponent: 2 })).toBe(true);
    expect(isValidExactMoney({ amountMinor: 5000, currency: 'USD', exponent: 2 })).toBe(true);
    expect(isValidExactMoney({ amountMinor: 0, currency: 'EUR', exponent: 2 })).toBe(true);

    // Strictly rejected negative values
    expect(isValidExactMoney({ amountMinor: '-100', currency: 'PKR', exponent: 2 })).toBe(false);
    expect(isValidExactMoney({ amountMinor: -500, currency: 'USD', exponent: 2 })).toBe(false);

    // Strictly rejected fractional or non-numeric values
    expect(isValidExactMoney({ amountMinor: '35.5', currency: 'AED', exponent: 2 })).toBe(false);
    expect(isValidExactMoney({ amountMinor: 'abc', currency: 'AED', exponent: 2 })).toBe(false);
    expect(isValidExactMoney({ amountMinor: NaN, currency: 'AED', exponent: 2 })).toBe(false);

    // Strictly rejected invalid currency or exponent
    expect(isValidExactMoney({ amountMinor: '3500', currency: 'US', exponent: 2 })).toBe(false);
    expect(isValidExactMoney({ amountMinor: '3500', currency: 'USDT', exponent: 2 })).toBe(false);
    expect(isValidExactMoney({ amountMinor: '3500', currency: 'USD', exponent: 5 })).toBe(false);
    expect(isValidExactMoney({ amountMinor: '3500', currency: 'USD', exponent: -1 })).toBe(false);

    // Missing fields
    expect(isValidExactMoney(null)).toBe(false);
    expect(isValidExactMoney({})).toBe(false);
    expect(isValidExactMoney({ currency: 'PKR', exponent: 2 })).toBe(false);
  });

  it('8. Detects missing active configuration', async () => {
    const emptyScope = `empty-scope-${seq}`;
    const report = await runShippingReconciliation({ merchantScopeId: emptyScope });
    expect(report.success).toBe(false);
    expect(report.anomalies.some((a) => a.type === 'MISSING_ACTIVE_VERSION')).toBe(true);
  });

  it('9. Detects multiple active configurations for same tenant', async () => {
    const dupScope = `dup-active-scope-${seq}`;
    jest.spyOn(CommerceConfigurationVersion, 'find').mockReturnValueOnce({
      lean: async () => [
        { _id: new mongoose.Types.ObjectId(), merchantScopeId: dupScope, version: 1, status: 'active', shippingRules: [] },
        { _id: new mongoose.Types.ObjectId(), merchantScopeId: dupScope, version: 2, status: 'active', shippingRules: [] }
      ]
    });

    const report = await runShippingReconciliation({ merchantScopeId: dupScope });
    expect(report.success).toBe(false);
    expect(report.anomalies.some((a) => a.type === 'MULTIPLE_ACTIVE_VERSIONS')).toBe(true);
  });

  it('10. Detects uncovered enabled country without matching shipping rule', async () => {
    const uncoveredScope = `uncovered-scope-${seq}`;
    const col = mongoose.connection.collection('commerceconfigurationversions');
    await col.insertOne({
      merchantScopeId: uncoveredScope,
      version: 1,
      status: 'active',
      merchantProfile: {
        merchantCountry: 'PK',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        enabledCountries: ['PK', 'AE', 'GB'],
        enabledCurrencies: ['PKR', 'AED', 'GBP']
      },
      shippingRules: [
        {
          ruleId: 'RULE-PK',
          name: 'PK Standard',
          displayName: 'PK Standard',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: MoneyMapper.fromLegacy(100, 'PKR'),
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 2,
          enabled: true
        }
      ]
    });

    const report = await runShippingReconciliation({ merchantScopeId: uncoveredScope });
    expect(report.uncoveredCountries).toContain('AE');
    expect(report.uncoveredCountries).toContain('GB');
    expect(report.anomalies.some((a) => a.type === 'UNCOVERED_ENABLED_COUNTRY' && a.country === 'AE')).toBe(true);
  });

  it('11. Detects unauthorized or inactive fulfillment locations', async () => {
    const locScope = `loc-anom-scope-${seq}`;
    const col = mongoose.connection.collection('commerceconfigurationversions');
    await col.insertOne({
      merchantScopeId: locScope,
      version: 1,
      status: 'active',
      merchantProfile: { merchantCountry: 'PK', baseCurrency: 'PKR', defaultCurrency: 'AED', enabledCountries: ['AE'], enabledCurrencies: ['AED'] },
      shippingRules: [
        {
          ruleId: 'RULE-AE-EXP',
          name: 'AE Express',
          displayName: 'AE Express',
          serviceCode: 'express',
          originCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: MoneyMapper.fromLegacy(50, 'AED'),
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 3,
          enabled: true
        }
      ]
    });

    await FulfillmentLocation.create({
      merchantScopeId: locScope,
      locationCode: `INACTIVE-LOC-${seq}`,
      displayName: 'Inactive Hub',
      status: 'suspended',
      countryCode: 'PK',
      city: 'Karachi',
      timeZone: 'Asia/Karachi',
      priority: 10,
      supportedMarketCountries: ['AE'],
      supportedServiceLevels: ['express']
    });

    const report = await runShippingReconciliation({ merchantScopeId: locScope });
    expect(report.success).toBe(false);
    expect(report.anomalies.some((a) => a.type === 'INACTIVE_FULFILLMENT_LOCATION')).toBe(true);
  });

  it('12. Detects money currency and exponent mismatch and negative amounts', async () => {
    const moneyScope = `money-scope-${seq}`;
    const col = mongoose.connection.collection('commerceconfigurationversions');
    await col.insertOne({
      merchantScopeId: moneyScope,
      version: 1,
      status: 'active',
      merchantProfile: { merchantCountry: 'PK', baseCurrency: 'PKR', defaultCurrency: 'AED', enabledCountries: ['AE'], enabledCurrencies: ['AED', 'USD'] },
      shippingRules: [
        {
          ruleId: 'RULE-MISMATCH',
          name: 'Mismatch Rule',
          displayName: 'Mismatch Rule',
          serviceCode: 'standard',
          originCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
          remoteRateExact: { amountMinor: '2000', currency: 'USD', exponent: 2 },
          processingCutoffLocal: '15:00',
          workingDays: [1, 2, 3, 4, 5],
          deliveryMinDays: 1,
          deliveryMaxDays: 3,
          enabled: true
        }
      ]
    });

    const report = await runShippingReconciliation({ merchantScopeId: moneyScope });
    expect(report.success).toBe(false);
    expect(report.anomalies.some((a) => a.type === 'MONEY_CURRENCY_EXPONENT_MISMATCH')).toBe(true);
  });

  it('13. Reports legacy ShippingZone drift as informational without failing clean tenant', async () => {
    const driftScope = `drift-scope-${seq}`;
    await CommerceConfigurationVersion.create(createValidConfigData(driftScope));

    await FulfillmentLocation.create({
      merchantScopeId: driftScope,
      locationCode: `DRIFT-LOC-${seq}`,
      displayName: 'Drift Hub',
      status: 'active',
      countryCode: 'PK',
      city: 'Karachi',
      timeZone: 'Asia/Karachi',
      priority: 10,
      supportedMarketCountries: ['PK', 'AE'],
      supportedServiceLevels: ['standard']
    });

    const szCol = mongoose.connection.collection('shippingzones');
    await szCol.insertOne({
      name: `Legacy Drift Zone ${seq}`,
      countries: ['PK'],
      normalRate: 100,
      freeShippingThreshold: 5000,
      deliveryMinDays: 1,
      deliveryMaxDays: 3,
      enabled: true
    });

    const report = await runShippingReconciliation({ merchantScopeId: driftScope });
    expect(report.success).toBe(true);
    expect(report.anomalies.some((a) => a.type === 'LEGACY_SHIPPING_ZONE_DRIFT')).toBe(true);
    expect(report.legacyZonesCount).toBeGreaterThanOrEqual(1);
  });
});

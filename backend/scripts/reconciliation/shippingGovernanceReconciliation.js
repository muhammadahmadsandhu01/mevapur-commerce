/**
 * @file shippingGovernanceReconciliation.js
 * @description Operational read-only reconciliation script for shipping governance rules,
 * route coverage, rate bounds, fulfillment location authority, and legacy shipping zone alignment.
 */

'use strict';

const mongoose = require('mongoose');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const ShippingZone = require('../../models/ShippingZone');
const { CountryRegistry } = require('../../modules/commerce');

const EXIT_CODE = {
  SUCCESS: 0,
  DISCREPANCIES_FOUND: 1,
  CLI_ERROR: 2,
  RUNTIME_ERROR: 3
};

function isValidExactMoney(money) {
  if (!money || typeof money !== 'object') return false;
  let amountStr = '';
  if (money.amountMinor != null) {
    if (typeof money.amountMinor === 'object' && typeof money.amountMinor.toString === 'function') {
      amountStr = money.amountMinor.toString().trim();
    } else {
      amountStr = String(money.amountMinor).trim();
    }
  } else {
    return false;
  }
  if (!/^\d+$/.test(amountStr)) return false;
  if (typeof money.currency !== 'string' || !/^[A-Z]{3}$/.test(money.currency.trim())) return false;
  if (money.exponent == null || typeof money.exponent !== 'number' || !Number.isInteger(money.exponent) || money.exponent < 0 || money.exponent > 4) return false;
  return true;
}

/**
 * Reconciles shipping governance for a single merchant scope.
 * Strictly read-only: performs zero database mutations.
 * @param {string} merchantScopeId
 * @param {Object} [options]
 * @param {number} [options.legacyZonesCount]
 * @returns {Promise<Object>} Single tenant reconciliation report
 */
async function reconcileSingleTenant(merchantScopeId, { legacyZonesCount } = {}) {
  const scope = String(merchantScopeId || '').trim();
  const anomalies = [];
  const uncoveredCountries = [];

  const activeVersions = await CommerceConfigurationVersion.find({
    merchantScopeId: scope,
    status: 'active'
  }).lean();

  if (activeVersions.length === 0) {
    anomalies.push({
      type: 'MISSING_ACTIVE_VERSION',
      severity: 'CRITICAL',
      merchantScopeId: scope,
      message: `No active CommerceConfigurationVersion found for merchantScopeId '${scope}'`
    });
    return {
      success: false,
      merchantScopeId: scope,
      activeVersionId: null,
      versionNumber: null,
      totalRules: 0,
      activeRules: 0,
      coveredDestinations: [],
      uncoveredCountries: [],
      anomalies
    };
  }

  if (activeVersions.length > 1) {
    anomalies.push({
      type: 'MULTIPLE_ACTIVE_VERSIONS',
      severity: 'CRITICAL',
      merchantScopeId: scope,
      count: activeVersions.length,
      versionIds: activeVersions.map((v) => String(v._id)),
      message: `Multiple active CommerceConfigurationVersions found for merchantScopeId '${scope}' (${activeVersions.length} active versions)`
    });
  }

  const activeVersion = activeVersions[0];
  const enabledCountries = activeVersion.merchantProfile?.enabledCountries || [];
  const enabledCurrencies = new Set(activeVersion.merchantProfile?.enabledCurrencies || []);
  const shippingRules = activeVersion.shippingRules || [];
  const merchantOrigin = activeVersion.merchantProfile?.merchantCountry || 'PK';

  // 1. Check country coverage for enabled destinations
  const coveredDestinations = new Set(shippingRules.filter((r) => r.enabled !== false).map((r) => r.destinationCountry));
  for (const country of enabledCountries) {
    if (!coveredDestinations.has(country)) {
      uncoveredCountries.push(country);
      anomalies.push({
        type: 'UNCOVERED_ENABLED_COUNTRY',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        country,
        message: `Enabled market country '${country}' has no active shipping rules configured`
      });
    }
  }

  // 2. Fetch fulfillment locations for authority verification
  const now = new Date();
  const allLocations = await FulfillmentLocation.find({ merchantScopeId: scope }).lean();
  const activeLocations = allLocations.filter((loc) => (
    loc.status === 'active'
    && (!loc.effectiveFrom || new Date(loc.effectiveFrom) <= now)
    && (!loc.effectiveTo || new Date(loc.effectiveTo) > now)
  ));

  // 3. Validate shipping rules
  const seenRuleIds = new Set();
  for (let i = 0; i < shippingRules.length; i++) {
    const rule = shippingRules[i];

    if (seenRuleIds.has(rule.ruleId)) {
      anomalies.push({
        type: 'DUPLICATE_RULE_ID',
        severity: 'CRITICAL',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        message: `Duplicate shipping ruleId '${rule.ruleId}' at index ${i}`
      });
    }
    seenRuleIds.add(rule.ruleId);

    if (!rule.serviceCode || typeof rule.serviceCode !== 'string' || !rule.serviceCode.trim()) {
      anomalies.push({
        type: 'MISSING_SERVICE_CODE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        message: `Rule '${rule.ruleId}' is missing required serviceCode`
      });
    }

    if (!rule.destinationCountry || !CountryRegistry.hasCountry(rule.destinationCountry)) {
      anomalies.push({
        type: 'INVALID_DESTINATION_COUNTRY',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        country: rule.destinationCountry,
        message: `Rule '${rule.ruleId}' has invalid destinationCountry '${rule.destinationCountry}'`
      });
    }

    if (rule.originCountry && !CountryRegistry.hasCountry(rule.originCountry)) {
      anomalies.push({
        type: 'INVALID_ORIGIN_COUNTRY',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        country: rule.originCountry,
        message: `Rule '${rule.ruleId}' has invalid originCountry '${rule.originCountry}'`
      });
    }

    // Governed timing & envelope checks
    if (rule.processingCutoffLocal != null || rule.enabled) {
      if (!rule.processingCutoffLocal || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(String(rule.processingCutoffLocal).trim())) {
        anomalies.push({
          type: 'MALFORMED_PROCESSING_CUTOFF',
          severity: 'HIGH',
          merchantScopeId: scope,
          configVersion: activeVersion.version,
          ruleId: rule.ruleId,
          cutoff: rule.processingCutoffLocal,
          message: `Rule '${rule.ruleId}' has malformed processingCutoffLocal: '${rule.processingCutoffLocal}'`
        });
      }
    }

    if (rule.workingDays != null || rule.enabled) {
      if (!Array.isArray(rule.workingDays) || rule.workingDays.length === 0 || rule.workingDays.some((d) => typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 7)) {
        anomalies.push({
          type: 'INVALID_WORKING_DAYS',
          severity: 'HIGH',
          merchantScopeId: scope,
          configVersion: activeVersion.version,
          ruleId: rule.ruleId,
          workingDays: rule.workingDays,
          message: `Rule '${rule.ruleId}' has missing or invalid workingDays`
        });
      } else if (new Set(rule.workingDays).size !== rule.workingDays.length) {
        anomalies.push({
          type: 'DUPLICATE_WORKING_DAYS',
          severity: 'HIGH',
          merchantScopeId: scope,
          configVersion: activeVersion.version,
          ruleId: rule.ruleId,
          workingDays: rule.workingDays,
          message: `Rule '${rule.ruleId}' has duplicate workingDays entries`
        });
      }
    }

    if (rule.processingMinBusinessDays != null && (typeof rule.processingMinBusinessDays !== 'number' || !Number.isInteger(rule.processingMinBusinessDays) || rule.processingMinBusinessDays < 0)) {
      anomalies.push({
        type: 'INVALID_PROCESSING_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        days: rule.processingMinBusinessDays,
        message: `Rule '${rule.ruleId}' has invalid processingMinBusinessDays: ${rule.processingMinBusinessDays}`
      });
    }
    if (rule.processingMaxBusinessDays != null && (typeof rule.processingMaxBusinessDays !== 'number' || !Number.isInteger(rule.processingMaxBusinessDays) || rule.processingMaxBusinessDays < 0)) {
      anomalies.push({
        type: 'INVALID_PROCESSING_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        days: rule.processingMaxBusinessDays,
        message: `Rule '${rule.ruleId}' has invalid processingMaxBusinessDays: ${rule.processingMaxBusinessDays}`
      });
    }
    if (rule.processingMinBusinessDays != null && rule.processingMaxBusinessDays != null && rule.processingMaxBusinessDays < rule.processingMinBusinessDays) {
      anomalies.push({
        type: 'INVERTED_PROCESSING_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        min: rule.processingMinBusinessDays,
        max: rule.processingMaxBusinessDays,
        message: `Rule '${rule.ruleId}' has processingMaxBusinessDays (${rule.processingMaxBusinessDays}) < processingMinBusinessDays (${rule.processingMinBusinessDays})`
      });
    }

    if (rule.deliveryMinDays == null || typeof rule.deliveryMinDays !== 'number' || !Number.isInteger(rule.deliveryMinDays) || rule.deliveryMinDays <= 0) {
      anomalies.push({
        type: 'INVALID_DELIVERY_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        days: rule.deliveryMinDays,
        message: `Rule '${rule.ruleId}' has invalid deliveryMinDays: ${rule.deliveryMinDays}`
      });
    }
    if (rule.deliveryMaxDays == null || typeof rule.deliveryMaxDays !== 'number' || !Number.isInteger(rule.deliveryMaxDays) || rule.deliveryMaxDays <= 0) {
      anomalies.push({
        type: 'INVALID_DELIVERY_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        days: rule.deliveryMaxDays,
        message: `Rule '${rule.ruleId}' has invalid deliveryMaxDays: ${rule.deliveryMaxDays}`
      });
    }
    if (rule.deliveryMinDays != null && rule.deliveryMaxDays != null && rule.deliveryMaxDays < rule.deliveryMinDays) {
      anomalies.push({
        type: 'INVERTED_DELIVERY_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        min: rule.deliveryMinDays,
        max: rule.deliveryMaxDays,
        message: `Rule '${rule.ruleId}' has deliveryMaxDays (${rule.deliveryMaxDays}) < deliveryMinDays (${rule.deliveryMinDays})`
      });
    }

    if (rule.remoteDeliveryMinDays != null && (typeof rule.remoteDeliveryMinDays !== 'number' || !Number.isInteger(rule.remoteDeliveryMinDays) || rule.remoteDeliveryMinDays <= 0)) {
      anomalies.push({
        type: 'INVALID_REMOTE_DELIVERY_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        days: rule.remoteDeliveryMinDays,
        message: `Rule '${rule.ruleId}' has invalid remoteDeliveryMinDays: ${rule.remoteDeliveryMinDays}`
      });
    }
    if (rule.remoteDeliveryMaxDays != null && (typeof rule.remoteDeliveryMaxDays !== 'number' || !Number.isInteger(rule.remoteDeliveryMaxDays) || rule.remoteDeliveryMaxDays <= 0)) {
      anomalies.push({
        type: 'INVALID_REMOTE_DELIVERY_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        days: rule.remoteDeliveryMaxDays,
        message: `Rule '${rule.ruleId}' has invalid remoteDeliveryMaxDays: ${rule.remoteDeliveryMaxDays}`
      });
    }
    if (rule.remoteDeliveryMinDays != null && rule.remoteDeliveryMaxDays != null && rule.remoteDeliveryMaxDays < rule.remoteDeliveryMinDays) {
      anomalies.push({
        type: 'INVERTED_REMOTE_DELIVERY_ENVELOPE',
        severity: 'HIGH',
        merchantScopeId: scope,
        configVersion: activeVersion.version,
        ruleId: rule.ruleId,
        min: rule.remoteDeliveryMinDays,
        max: rule.remoteDeliveryMaxDays,
        message: `Rule '${rule.ruleId}' has remoteDeliveryMaxDays (${rule.remoteDeliveryMaxDays}) < remoteDeliveryMinDays (${rule.remoteDeliveryMinDays})`
      });
    }

    // Exact money checks
    if (rule.baseRateExact) {
      if (!isValidExactMoney(rule.baseRateExact)) {
        anomalies.push({
          type: 'INVALID_EXACT_MONEY',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          configVersion: activeVersion.version,
          ruleId: rule.ruleId,
          field: 'baseRateExact',
          message: `Rule '${rule.ruleId}' has invalid baseRateExact exact money structure`
        });
      } else if (enabledCurrencies.size > 0 && !enabledCurrencies.has(rule.baseRateExact.currency)) {
        anomalies.push({
          type: 'RULE_CURRENCY_NOT_ENABLED',
          severity: 'HIGH',
          merchantScopeId: scope,
          configVersion: activeVersion.version,
          ruleId: rule.ruleId,
          currency: rule.baseRateExact.currency,
          message: `Rule '${rule.ruleId}' uses currency '${rule.baseRateExact.currency}' which is not enabled in merchant profile`
        });
      }
    }

    const remoteMoney = rule.remoteRateExact || rule.remoteSurchargeExact;
    if (remoteMoney) {
      if (!isValidExactMoney(remoteMoney)) {
        anomalies.push({
          type: 'INVALID_EXACT_MONEY',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          configVersion: activeVersion.version,
          ruleId: rule.ruleId,
          field: 'remoteRateExact',
          message: `Rule '${rule.ruleId}' has invalid remoteRateExact exact money structure`
        });
      } else if (rule.baseRateExact && isValidExactMoney(rule.baseRateExact)) {
        if (remoteMoney.currency !== rule.baseRateExact.currency || remoteMoney.exponent !== rule.baseRateExact.exponent) {
          anomalies.push({
            type: 'MONEY_CURRENCY_EXPONENT_MISMATCH',
            severity: 'CRITICAL',
            merchantScopeId: scope,
            configVersion: activeVersion.version,
            ruleId: rule.ruleId,
            field: 'remoteRateExact',
            message: `Rule '${rule.ruleId}' remote rate money (${remoteMoney.currency}/${remoteMoney.exponent}) does not match base rate (${rule.baseRateExact.currency}/${rule.baseRateExact.exponent})`
          });
        }
      }
    }

    if (rule.freeShippingThresholdExact) {
      if (!isValidExactMoney(rule.freeShippingThresholdExact)) {
        anomalies.push({
          type: 'INVALID_EXACT_MONEY',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          configVersion: activeVersion.version,
          ruleId: rule.ruleId,
          field: 'freeShippingThresholdExact',
          message: `Rule '${rule.ruleId}' has invalid freeShippingThresholdExact exact money structure`
        });
      } else if (rule.baseRateExact && isValidExactMoney(rule.baseRateExact)) {
        if (rule.freeShippingThresholdExact.currency !== rule.baseRateExact.currency || rule.freeShippingThresholdExact.exponent !== rule.baseRateExact.exponent) {
          anomalies.push({
            type: 'MONEY_CURRENCY_EXPONENT_MISMATCH',
            severity: 'CRITICAL',
            merchantScopeId: scope,
            configVersion: activeVersion.version,
            ruleId: rule.ruleId,
            field: 'freeShippingThresholdExact',
            message: `Rule '${rule.ruleId}' free shipping threshold money (${rule.freeShippingThresholdExact.currency}/${rule.freeShippingThresholdExact.exponent}) does not match base rate (${rule.baseRateExact.currency}/${rule.baseRateExact.exponent})`
          });
        }
      }
    }

    // Weight bands
    const bands = rule.weightBands || [];
    const validBands = [];
    for (const band of bands) {
      if (band.minWeightGrams == null || band.maxWeightGrams == null || typeof band.minWeightGrams !== 'number' || typeof band.maxWeightGrams !== 'number' || band.minWeightGrams < 0 || band.maxWeightGrams <= band.minWeightGrams) {
        anomalies.push({
          type: 'INVERTED_WEIGHT_BAND',
          severity: 'HIGH',
          merchantScopeId: scope,
          configVersion: activeVersion.version,
          ruleId: rule.ruleId,
          min: band.minWeightGrams,
          max: band.maxWeightGrams,
          message: `Rule '${rule.ruleId}' has inverted or invalid weight band: ${band.minWeightGrams}g - ${band.maxWeightGrams}g`
        });
      } else {
        validBands.push(band);
      }

      const bandMoney = band.adjustmentExact || band.rateExact;
      if (bandMoney) {
        if (!isValidExactMoney(bandMoney)) {
          anomalies.push({
            type: 'INVALID_EXACT_MONEY',
            severity: 'CRITICAL',
            merchantScopeId: scope,
            configVersion: activeVersion.version,
            ruleId: rule.ruleId,
            field: 'weightBandMoney',
            message: `Rule '${rule.ruleId}' weight band has invalid exact money structure`
          });
        } else if (rule.baseRateExact && isValidExactMoney(rule.baseRateExact)) {
          if (bandMoney.currency !== rule.baseRateExact.currency || bandMoney.exponent !== rule.baseRateExact.exponent) {
            anomalies.push({
              type: 'MONEY_CURRENCY_EXPONENT_MISMATCH',
              severity: 'CRITICAL',
              merchantScopeId: scope,
              configVersion: activeVersion.version,
              ruleId: rule.ruleId,
              field: 'weightBandMoney',
              message: `Rule '${rule.ruleId}' weight band money does not match base rate currency/exponent`
            });
          }
        }
      }
    }

    if (validBands.length > 1) {
      const sortedBands = [...validBands].sort((a, b) => a.minWeightGrams - b.minWeightGrams);
      for (let j = 0; j < sortedBands.length - 1; j++) {
        if (sortedBands[j].maxWeightGrams > sortedBands[j + 1].minWeightGrams) {
          anomalies.push({
            type: 'OVERLAPPING_WEIGHT_BANDS',
            severity: 'HIGH',
            merchantScopeId: scope,
            configVersion: activeVersion.version,
            ruleId: rule.ruleId,
            message: `Rule '${rule.ruleId}' has overlapping weight bands: (${sortedBands[j].minWeightGrams}-${sortedBands[j].maxWeightGrams}) and (${sortedBands[j + 1].minWeightGrams}-${sortedBands[j + 1].maxWeightGrams})`
          });
        } else if (sortedBands[j].maxWeightGrams < sortedBands[j + 1].minWeightGrams) {
          anomalies.push({
            type: 'WEIGHT_BAND_GAP',
            severity: 'LOW',
            merchantScopeId: scope,
            configVersion: activeVersion.version,
            ruleId: rule.ruleId,
            gap: { from: sortedBands[j].maxWeightGrams, to: sortedBands[j + 1].minWeightGrams },
            message: `Rule '${rule.ruleId}' has non-contiguous gap in weight bands from ${sortedBands[j].maxWeightGrams}g to ${sortedBands[j + 1].minWeightGrams}g`
          });
        }
      }
    }

    // Fulfillment location check for enabled rule
    if (rule.enabled !== false) {
      const originCountry = rule.originCountry || merchantOrigin;
      const destCountry = rule.destinationCountry;
      const srvCode = (rule.serviceCode || 'standard').toLowerCase();

      const matchingActiveLoc = activeLocations.find((loc) => (
        loc.countryCode === originCountry
        && Array.isArray(loc.supportedMarketCountries) && loc.supportedMarketCountries.includes(destCountry)
        && Array.isArray(loc.supportedServiceLevels) && loc.supportedServiceLevels.some((s) => s.toLowerCase() === srvCode)
      ));

      if (!matchingActiveLoc) {
        const anyLocForOrigin = allLocations.find((loc) => loc.countryCode === originCountry);
        if (anyLocForOrigin && anyLocForOrigin.status !== 'active') {
          anomalies.push({
            type: 'INACTIVE_FULFILLMENT_LOCATION',
            severity: 'HIGH',
            merchantScopeId: scope,
            configVersion: activeVersion.version,
            ruleId: rule.ruleId,
            originCountry,
            locationCode: anyLocForOrigin.locationCode,
            status: anyLocForOrigin.status,
            message: `Rule '${rule.ruleId}' fulfillment origin location '${anyLocForOrigin.locationCode}' is inactive (${anyLocForOrigin.status})`
          });
        } else {
          anomalies.push({
            type: 'NO_AUTHORIZED_FULFILLMENT_LOCATION',
            severity: 'HIGH',
            merchantScopeId: scope,
            configVersion: activeVersion.version,
            ruleId: rule.ruleId,
            originCountry,
            destinationCountry: destCountry,
            serviceCode: rule.serviceCode,
            message: `Rule '${rule.ruleId}' has no active authorized FulfillmentLocation supporting origin '${originCountry}', market '${destCountry}', and service '${rule.serviceCode}'`
          });
        }
      }
    }
  }

  // Legacy ShippingZone count check (informational)
  let legacyCount = legacyZonesCount;
  if (legacyCount === undefined || legacyCount === null) {
    legacyCount = await ShippingZone.countDocuments({});
  }
  if (legacyCount > 0) {
    anomalies.push({
      type: 'LEGACY_SHIPPING_ZONE_DRIFT',
      severity: 'INFO',
      merchantScopeId: scope,
      count: legacyCount,
      message: `${legacyCount} legacy ShippingZone documents exist in database (disabled runtime authority)`
    });
  }

  const criticalOrHighAnomalies = anomalies.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH');

  return {
    success: criticalOrHighAnomalies.length === 0,
    merchantScopeId: scope,
    activeVersionId: activeVersion._id,
    versionNumber: activeVersion.version,
    totalRules: shippingRules.length,
    activeRules: shippingRules.filter((r) => r.enabled !== false).length,
    coveredDestinations: Array.from(coveredDestinations),
    uncoveredCountries,
    legacyZonesCount: legacyCount,
    anomalies
  };
}

/**
 * Retrieves the next batch of distinct merchantScopeIds in ascending order using keyset pagination.
 * @param {string|null} lastScope
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
async function getNextTenantBatch(lastScope = null, limit = 25) {
  const match = lastScope ? { merchantScopeId: { $gt: lastScope } } : {};
  const pipeline = [
    { $match: match },
    { $group: { _id: '$merchantScopeId' } },
    { $sort: { _id: 1 } },
    { $limit: limit }
  ];
  const results = await CommerceConfigurationVersion.aggregate(pipeline);
  return results.map((r) => r._id).filter(Boolean);
}

/**
 * Runs shipping governance reconciliation across explicit tenant scope or bounded multi-tenant cursor.
 * Strictly read-only: performs zero database mutations.
 * @param {Object} [options]
 * @param {string} [options.merchantScopeId]
 * @param {boolean} [options.allTenants=false]
 * @param {number} [options.batchSize=25]
 * @returns {Promise<Object>} Reconciliation summary
 */
async function runShippingReconciliation({
  merchantScopeId = null,
  allTenants = false,
  batchSize = 25
} = {}) {
  // Fail closed if neither explicit merchantScopeId nor explicit allTenants mode is supplied
  if (!merchantScopeId && !allTenants) {
    return {
      success: false,
      error: 'EXPLICIT_TENANT_SCOPE_OR_ALL_TENANTS_REQUIRED',
      message: 'Reconciliation requires explicit merchantScopeId or allTenants mode',
      anomalies: [
        {
          type: 'TENANT_SCOPE_REQUIRED',
          severity: 'CRITICAL',
          message: 'Reconciliation requires explicit merchantScopeId or allTenants mode'
        }
      ]
    };
  }

  // Fetch legacy shipping zones count once globally
  const globalLegacyZonesCount = await ShippingZone.countDocuments({});

  // Single tenant reconciliation
  if (merchantScopeId) {
    return reconcileSingleTenant(merchantScopeId, { legacyZonesCount: globalLegacyZonesCount });
  }

  // Multi-tenant bounded keyset batch processing
  const safeBatchSize = Math.max(1, Math.min(100, Math.floor(Number(batchSize) || 25)));
  const tenantReports = [];
  let totalAnomaliesCount = 0;
  let hasCriticalOrHighFailures = false;
  let lastScope = null;
  let totalTenantsProcessed = 0;

  while (true) {
    const batch = await getNextTenantBatch(lastScope, safeBatchSize);
    if (!batch || batch.length === 0) {
      if (totalTenantsProcessed === 0) {
        // Fallback: evaluate default tenant scope if no versioned scopes found
        const defaultReport = await reconcileSingleTenant('default', { legacyZonesCount: globalLegacyZonesCount });
        tenantReports.push(defaultReport);
        totalAnomaliesCount += defaultReport.anomalies.length;
        if (!defaultReport.success) {
          hasCriticalOrHighFailures = true;
        }
        totalTenantsProcessed = 1;
      }
      break;
    }

    for (const scope of batch) {
      const report = await reconcileSingleTenant(scope, { legacyZonesCount: globalLegacyZonesCount });
      tenantReports.push(report);
      totalAnomaliesCount += report.anomalies.length;
      if (!report.success) {
        hasCriticalOrHighFailures = true;
      }
      totalTenantsProcessed++;
    }

    lastScope = batch[batch.length - 1];
    if (batch.length < safeBatchSize) {
      break;
    }
  }

  return {
    success: !hasCriticalOrHighFailures,
    allTenants: true,
    processedTenants: tenantReports.length,
    batchSize: safeBatchSize,
    totalAnomalies: totalAnomaliesCount,
    tenantReports
  };
}

module.exports = {
  EXIT_CODE,
  isValidExactMoney,
  getNextTenantBatch,
  runShippingReconciliation,
  reconcileSingleTenant
};

if (require.main === module) {
  const args = process.argv.slice(2);
  let merchantScopeId = null;
  let allTenants = false;
  let rawBatchSize = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tenant' || args[i] === '--merchantScopeId') {
      merchantScopeId = args[i + 1];
      i++;
    } else if (args[i] === '--all-tenants' || args[i] === '--all') {
      allTenants = true;
    } else if (args[i] === '--batch-size') {
      rawBatchSize = args[i + 1];
      i++;
    }
  }

  // CLI argument validation
  if (!merchantScopeId && !allTenants) {
    console.error(JSON.stringify({
      success: false,
      error: 'CLI_ERROR',
      message: 'Usage: node shippingGovernanceReconciliation.js --tenant <merchantScopeId> | --all-tenants [--batch-size <1-100>]'
    }, null, 2));
    process.exit(EXIT_CODE.CLI_ERROR);
  }

  let batchSize = 25;
  if (rawBatchSize !== null) {
    const parsed = parseInt(rawBatchSize, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
      console.error(JSON.stringify({
        success: false,
        error: 'INVALID_BATCH_SIZE',
        message: '--batch-size must be an integer between 1 and 100'
      }, null, 2));
      process.exit(EXIT_CODE.CLI_ERROR);
    }
    batchSize = parsed;
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur';
  mongoose.connect(mongoUri)
    .then(async () => {
      const report = await runShippingReconciliation({ merchantScopeId, allTenants, batchSize });
      console.log(JSON.stringify(report, null, 2));
      await mongoose.disconnect();
      process.exit(report.success ? EXIT_CODE.SUCCESS : EXIT_CODE.DISCREPANCIES_FOUND);
    })
    .catch((err) => {
      console.error(JSON.stringify({
        success: false,
        error: 'RUNTIME_ERROR',
        message: err.message || 'Runtime execution failure'
      }, null, 2));
      process.exit(EXIT_CODE.RUNTIME_ERROR);
    });
}

/**
 * @file shippingGovernanceReconciliation.js
 * @description Operational reconciliation script for shipping governance rules,
 * route coverage, rate bounds, and legacy shipping zone alignment.
 */

const mongoose = require('mongoose');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const ShippingZone = require('../../models/ShippingZone');
const { CountryRegistry, CurrencyRegistry } = require('../../modules/commerce');

/**
 * Runs preflight reconciliation and detects governance gaps.
 * @param {Object} [options]
 * @param {string} [options.merchantScopeId='default']
 * @returns {Promise<Object>} Reconciliation summary
 */
async function runShippingReconciliation({ merchantScopeId = 'default' } = {}) {
  const activeVersion = await CommerceConfigurationVersion.findOne({
    merchantScopeId,
    status: 'active'
  }).lean();

  const legacyZones = await ShippingZone.find({}).lean();

  const anomalies = [];
  const uncoveredCountries = [];

  if (!activeVersion) {
    anomalies.push({
      type: 'MISSING_ACTIVE_VERSION',
      severity: 'CRITICAL',
      message: `No active CommerceConfigurationVersion found for merchantScopeId '${merchantScopeId}'`
    });
    return {
      success: false,
      merchantScopeId,
      activeVersion: null,
      anomalies,
      uncoveredCountries,
      legacyZonesCount: legacyZones.length
    };
  }

  const enabledCountries = activeVersion.merchantProfile?.enabledCountries || [];
  const shippingRules = activeVersion.shippingRules || [];

  // 1. Check country coverage
  const coveredDestinations = new Set(shippingRules.filter((r) => r.enabled).map((r) => r.destinationCountry));
  for (const country of enabledCountries) {
    if (!coveredDestinations.has(country)) {
      uncoveredCountries.push(country);
      anomalies.push({
        type: 'UNCOVERED_ENABLED_COUNTRY',
        severity: 'HIGH',
        message: `Enabled market country '${country}' has no active shipping rules configured`
      });
    }
  }

  // 2. Validate rules
  const seenRuleIds = new Set();
  for (let i = 0; i < shippingRules.length; i++) {
    const rule = shippingRules[i];

    if (seenRuleIds.has(rule.ruleId)) {
      anomalies.push({
        type: 'DUPLICATE_RULE_ID',
        severity: 'CRITICAL',
        message: `Duplicate shipping ruleId '${rule.ruleId}' at index ${i}`
      });
    }
    seenRuleIds.add(rule.ruleId);

    if (!CountryRegistry.hasCountry(rule.destinationCountry)) {
      anomalies.push({
        type: 'INVALID_DESTINATION_COUNTRY',
        severity: 'HIGH',
        message: `Rule '${rule.ruleId}' has invalid destinationCountry '${rule.destinationCountry}'`
      });
    }

    if (!CountryRegistry.hasCountry(rule.originCountry)) {
      anomalies.push({
        type: 'INVALID_ORIGIN_COUNTRY',
        severity: 'HIGH',
        message: `Rule '${rule.ruleId}' has invalid originCountry '${rule.originCountry}'`
      });
    }

    if (rule.deliveryMaxDays < rule.deliveryMinDays) {
      anomalies.push({
        type: 'INVERTED_DELIVERY_DAYS',
        severity: 'MEDIUM',
        message: `Rule '${rule.ruleId}' has deliveryMaxDays (${rule.deliveryMaxDays}) < deliveryMinDays (${rule.deliveryMinDays})`
      });
    }

    for (const band of rule.weightBands || []) {
      if (band.maxWeightGrams <= band.minWeightGrams) {
        anomalies.push({
          type: 'INVERTED_WEIGHT_BAND',
          severity: 'HIGH',
          message: `Rule '${rule.ruleId}' has inverted weight band: ${band.minWeightGrams}g - ${band.maxWeightGrams}g`
        });
      }
    }
  }

  return {
    success: anomalies.length === 0,
    merchantScopeId,
    activeVersionId: activeVersion._id,
    versionNumber: activeVersion.version,
    totalRules: shippingRules.length,
    activeRules: shippingRules.filter((r) => r.enabled).length,
    coveredDestinations: Array.from(coveredDestinations),
    uncoveredCountries,
    legacyZonesCount: legacyZones.length,
    anomalies
  };
}

module.exports = {
  runShippingReconciliation
};

if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur';
  mongoose.connect(mongoUri)
    .then(async () => {
      const report = await runShippingReconciliation();
      console.log(JSON.stringify(report, null, 2));
      await mongoose.disconnect();
      process.exit(report.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Reconciliation execution failed:', err);
      process.exit(1);
    });
}

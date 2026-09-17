#!/usr/bin/env node
'use strict';

/**
 * @file phase6d3-shipping-governance.js
 * @description Guarded, idempotent index and invariant migration for Phase 6D-3 Shipping Governance,
 * Multi-Service Rate Calculation, Fulfillment Routing, and Quote Authority.
 *
 * Supported modes:
 *   --inventory : Read-only evaluation and status breakdown.
 *   --dry-run   : Read-only simulation of index creations (default).
 *   --apply     : Bounded creation of scoped unique and query indexes.
 *   --verify    : Read-only verification scan.
 *   --finalize  : Separately authorized write of MigrationState completion evidence.
 *   --rollback  : Idempotent rollback of migration-owned indexes only (no data deleted).
 */

const mongoose = require('mongoose');
const MigrationState = require('../../models/MigrationState');
const { CountryRegistry } = require('../../modules/commerce');
const {
  MigrationGuardError,
  parseMigrationCli,
  validateTargetAndDbConfig
} = require('../lib/migrationRuntimeGuard');

const MIGRATION_ID = 'phase6d3-shipping-governance';

const ALLOWED_MODES = ['--inventory', '--dry-run', '--apply', '--verify', '--finalize', '--rollback'];
const ALLOWED_FLAGS = [
  '--confirm-phase6d3-apply',
  '--confirm-phase6d3-finalize',
  '--confirm-phase6d3-rollback',
  '--confirm-production',
  '--allow-local'
];

const REQUIRED_CONFIRMATION_MAP = {
  apply: {
    staging: ['--confirm-phase6d3-apply'],
    production: ['--confirm-phase6d3-apply', '--confirm-production'],
    local: ['--confirm-phase6d3-apply']
  },
  finalize: {
    staging: ['--confirm-phase6d3-finalize'],
    production: ['--confirm-phase6d3-finalize', '--confirm-production'],
    local: ['--confirm-phase6d3-finalize']
  },
  rollback: {
    staging: ['--confirm-phase6d3-rollback'],
    production: ['--confirm-phase6d3-rollback', '--confirm-production'],
    local: ['--confirm-phase6d3-rollback']
  }
};

const TARGET_INDEXES = [
  // CommerceConfigurationVersion indexes
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1, version: 1 },
    name: 'unique_tenant_config_version',
    options: { unique: true, name: 'unique_tenant_config_version' }
  },
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 },
    name: 'tenant_config_lifecycle_idx',
    options: { name: 'tenant_config_lifecycle_idx' }
  },
  {
    modelName: 'CommerceConfigurationVersion',
    collectionName: 'commerceconfigurationversions',
    key: { merchantScopeId: 1 },
    name: 'unique_active_tenant_config',
    options: {
      unique: true,
      partialFilterExpression: { status: 'active' },
      name: 'unique_active_tenant_config'
    }
  },

  // ShippingZone query index
  {
    modelName: 'ShippingZone',
    collectionName: 'shippingzones',
    key: { countries: 1, enabled: 1, priority: 1 },
    name: 'shipping_zone_lookup_idx',
    options: { name: 'shipping_zone_lookup_idx' }
  },

  // Order shipping & quote lookup indexes
  {
    modelName: 'Order',
    collectionName: 'orders',
    key: { 'shippingQuote.ruleId': 1 },
    name: 'order_shipping_rule_lookup_idx',
    options: {
      name: 'order_shipping_rule_lookup_idx',
      partialFilterExpression: { 'shippingQuote.ruleId': { $type: 'string', $gt: '' } }
    }
  },
  {
    modelName: 'Order',
    collectionName: 'orders',
    key: { 'quote.quoteId': 1 },
    name: 'order_quote_id_lookup_idx',
    options: {
      name: 'order_quote_id_lookup_idx',
      partialFilterExpression: { 'quote.quoteId': { $type: 'string', $gt: '' } }
    }
  }
];

function findIndexMatch(existingIndexes, targetIndex, targetName = null) {
  if (!Array.isArray(existingIndexes)) return null;
  const targetKey = targetIndex && targetIndex.key ? targetIndex.key : targetIndex;
  const targetKeyEntries = targetKey && typeof targetKey === 'object' ? Object.entries(targetKey) : [];

  return existingIndexes.find((existing) => {
    if (targetName && existing.name === targetName) return true;
    if (targetIndex && targetIndex.name && existing.name === targetIndex.name) return true;
    if (targetKeyEntries.length === 0) return false;

    const existingKey = existing.key || existing;
    const existingKeyEntries = Object.entries(existingKey);
    if (existingKeyEntries.length !== targetKeyEntries.length) return false;
    return targetKeyEntries.every(([k, v]) => existingKey[k] === v);
  }) || null;
}

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

async function inspectPreflightAnomalies(dbOrRules) {
  const anomalies = [];
  let configs = [];

  if (Array.isArray(dbOrRules)) {
    configs = [{ version: 1, merchantScopeId: 'default', shippingRules: dbOrRules }];
  } else if (dbOrRules && typeof dbOrRules.collection === 'function') {
    const configCol = dbOrRules.collection('commerceconfigurationversions');
    configs = await configCol.find({ status: 'active' }).toArray();
  } else if (dbOrRules && (Array.isArray(dbOrRules.shippingRules) || dbOrRules.version != null)) {
    configs = [dbOrRules];
  }

  for (const cfg of configs) {
    const merchantScopeId = cfg.merchantScopeId || 'default';
    const configVersion = cfg.version != null ? cfg.version : 1;
    const enabledCountries = Array.isArray(cfg.merchantProfile?.enabledCountries) ? cfg.merchantProfile.enabledCountries : null;
    const enabledCurrencies = Array.isArray(cfg.merchantProfile?.enabledCurrencies) ? new Set(cfg.merchantProfile.enabledCurrencies) : null;

    if (enabledCountries && enabledCountries.length > 0) {
      const activeRules = (cfg.shippingRules || []).filter((r) => r.enabled !== false);
      for (const country of enabledCountries) {
        const hasMatch = activeRules.some((r) => r.destinationCountry === country);
        if (!hasMatch) {
          anomalies.push({
            type: 'MISSING_MATCHING_RULE_FOR_ENABLED_DESTINATION',
            severity: 'HIGH',
            merchantScopeId,
            configVersion,
            country,
            message: `Enabled destination country '${country}' has no matching enabled shipping rule`
          });
        }
      }
    }

    const seenRuleIds = new Set();
    for (const rule of (cfg.shippingRules || [])) {
      if (seenRuleIds.has(rule.ruleId)) {
        anomalies.push({
          type: 'DUPLICATE_RULE_ID',
          severity: 'CRITICAL',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          message: `Duplicate rule ID '${rule.ruleId}' in configuration version ${configVersion}`
        });
      }
      seenRuleIds.add(rule.ruleId);

      if (!rule.serviceCode || typeof rule.serviceCode !== 'string' || !rule.serviceCode.trim()) {
        anomalies.push({
          type: 'MISSING_SERVICE_CODE',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          message: `Rule '${rule.ruleId}' is missing serviceCode`
        });
      }

      if (!rule.destinationCountry || !CountryRegistry.hasCountry(rule.destinationCountry)) {
        anomalies.push({
          type: 'INVALID_DESTINATION_COUNTRY',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          country: rule.destinationCountry,
          message: `Rule '${rule.ruleId}' has invalid destination country '${rule.destinationCountry}'`
        });
      }

      if (rule.originCountry && !CountryRegistry.hasCountry(rule.originCountry)) {
        anomalies.push({
          type: 'INVALID_ORIGIN_COUNTRY',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          country: rule.originCountry,
          message: `Rule '${rule.ruleId}' has invalid origin country '${rule.originCountry}'`
        });
      }

      // Governed processing cutoff
      if (rule.processingCutoffLocal != null || rule.enabled) {
        if (!rule.processingCutoffLocal || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(String(rule.processingCutoffLocal).trim())) {
          anomalies.push({
            type: 'INVALID_PROCESSING_CUTOFF',
            severity: 'HIGH',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            cutoff: rule.processingCutoffLocal,
            message: `Rule '${rule.ruleId}' has missing or malformed processingCutoffLocal: '${rule.processingCutoffLocal}'`
          });
        }
      }

      // Governed working days
      if (rule.workingDays != null || rule.enabled) {
        if (!Array.isArray(rule.workingDays) || rule.workingDays.length === 0 || rule.workingDays.some((d) => typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 7)) {
          anomalies.push({
            type: 'INVALID_WORKING_DAYS',
            severity: 'HIGH',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            workingDays: rule.workingDays,
            message: `Rule '${rule.ruleId}' has missing or invalid workingDays`
          });
        } else if (new Set(rule.workingDays).size !== rule.workingDays.length) {
          anomalies.push({
            type: 'DUPLICATE_WORKING_DAYS',
            severity: 'HIGH',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            workingDays: rule.workingDays,
            message: `Rule '${rule.ruleId}' contains duplicate workingDays`
          });
        }
      }

      // Processing envelopes
      if (rule.processingMinBusinessDays != null && (typeof rule.processingMinBusinessDays !== 'number' || !Number.isInteger(rule.processingMinBusinessDays) || rule.processingMinBusinessDays < 0)) {
        anomalies.push({
          type: 'INVALID_PROCESSING_MIN_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          days: rule.processingMinBusinessDays,
          message: `Rule '${rule.ruleId}' has invalid processingMinBusinessDays: ${rule.processingMinBusinessDays}`
        });
      }
      if (rule.processingMaxBusinessDays != null && (typeof rule.processingMaxBusinessDays !== 'number' || !Number.isInteger(rule.processingMaxBusinessDays) || rule.processingMaxBusinessDays < 0)) {
        anomalies.push({
          type: 'INVALID_PROCESSING_MAX_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          days: rule.processingMaxBusinessDays,
          message: `Rule '${rule.ruleId}' has invalid processingMaxBusinessDays: ${rule.processingMaxBusinessDays}`
        });
      }
      if (typeof rule.processingMinBusinessDays === 'number' && typeof rule.processingMaxBusinessDays === 'number' && rule.processingMaxBusinessDays < rule.processingMinBusinessDays) {
        anomalies.push({
          type: 'INVERTED_PROCESSING_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          min: rule.processingMinBusinessDays,
          max: rule.processingMaxBusinessDays,
          message: `Rule '${rule.ruleId}' has processingMaxBusinessDays (${rule.processingMaxBusinessDays}) < processingMinBusinessDays (${rule.processingMinBusinessDays})`
        });
      }

      // Delivery envelopes
      if (rule.deliveryMinDays != null && (typeof rule.deliveryMinDays !== 'number' || !Number.isInteger(rule.deliveryMinDays) || rule.deliveryMinDays < 0)) {
        anomalies.push({
          type: 'INVALID_DELIVERY_MIN_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          days: rule.deliveryMinDays,
          message: `Rule '${rule.ruleId}' has invalid deliveryMinDays: ${rule.deliveryMinDays}`
        });
      }
      if (rule.deliveryMaxDays != null && (typeof rule.deliveryMaxDays !== 'number' || !Number.isInteger(rule.deliveryMaxDays) || rule.deliveryMaxDays < 0)) {
        anomalies.push({
          type: 'INVALID_DELIVERY_MAX_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          days: rule.deliveryMaxDays,
          message: `Rule '${rule.ruleId}' has invalid deliveryMaxDays: ${rule.deliveryMaxDays}`
        });
      }
      if (rule.deliveryMaxDays != null && rule.deliveryMinDays != null && rule.deliveryMaxDays < rule.deliveryMinDays) {
        anomalies.push({
          type: 'INVERTED_DELIVERY_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          min: rule.deliveryMinDays,
          max: rule.deliveryMaxDays,
          message: `Rule '${rule.ruleId}' has deliveryMaxDays (${rule.deliveryMaxDays}) < deliveryMinDays (${rule.deliveryMinDays})`
        });
      }

      // Remote delivery envelopes
      if (rule.remoteDeliveryMinDays != null && (typeof rule.remoteDeliveryMinDays !== 'number' || !Number.isInteger(rule.remoteDeliveryMinDays) || rule.remoteDeliveryMinDays < 0)) {
        anomalies.push({
          type: 'INVALID_REMOTE_DELIVERY_MIN_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          days: rule.remoteDeliveryMinDays,
          message: `Rule '${rule.ruleId}' has invalid remoteDeliveryMinDays: ${rule.remoteDeliveryMinDays}`
        });
      }
      if (rule.remoteDeliveryMaxDays != null && (typeof rule.remoteDeliveryMaxDays !== 'number' || !Number.isInteger(rule.remoteDeliveryMaxDays) || rule.remoteDeliveryMaxDays < 0)) {
        anomalies.push({
          type: 'INVALID_REMOTE_DELIVERY_MAX_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          days: rule.remoteDeliveryMaxDays,
          message: `Rule '${rule.ruleId}' has invalid remoteDeliveryMaxDays: ${rule.remoteDeliveryMaxDays}`
        });
      }
      if (rule.remoteDeliveryMinDays != null && rule.remoteDeliveryMaxDays != null && rule.remoteDeliveryMaxDays < rule.remoteDeliveryMinDays) {
        anomalies.push({
          type: 'INVERTED_REMOTE_DELIVERY_DAYS',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
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
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            field: 'baseRateExact',
            message: `Rule '${rule.ruleId}' has invalid baseRateExact exact money structure`
          });
        } else if (enabledCurrencies && !enabledCurrencies.has(rule.baseRateExact.currency)) {
          anomalies.push({
            type: 'CURRENCY_NOT_ENABLED',
            severity: 'HIGH',
            merchantScopeId,
            configVersion,
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
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            field: 'remoteRateExact',
            message: `Rule '${rule.ruleId}' has invalid remoteRateExact exact money structure`
          });
        } else if (rule.baseRateExact && isValidExactMoney(rule.baseRateExact)) {
          if (remoteMoney.currency !== rule.baseRateExact.currency || remoteMoney.exponent !== rule.baseRateExact.exponent) {
            anomalies.push({
              type: 'MONEY_CURRENCY_EXPONENT_MISMATCH',
              severity: 'CRITICAL',
              merchantScopeId,
              configVersion,
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
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            field: 'freeShippingThresholdExact',
            message: `Rule '${rule.ruleId}' has invalid freeShippingThresholdExact exact money structure`
          });
        } else if (rule.baseRateExact && isValidExactMoney(rule.baseRateExact)) {
          if (rule.freeShippingThresholdExact.currency !== rule.baseRateExact.currency || rule.freeShippingThresholdExact.exponent !== rule.baseRateExact.exponent) {
            anomalies.push({
              type: 'MONEY_CURRENCY_EXPONENT_MISMATCH',
              severity: 'CRITICAL',
              merchantScopeId,
              configVersion,
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
            type: 'INVALID_WEIGHT_BAND_BOUNDS',
            severity: 'HIGH',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            min: band.minWeightGrams,
            max: band.maxWeightGrams,
            message: `Rule '${rule.ruleId}' has invalid weight band bounds: ${band.minWeightGrams}g - ${band.maxWeightGrams}g`
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
              merchantScopeId,
              configVersion,
              ruleId: rule.ruleId,
              field: 'weightBandMoney',
              message: `Rule '${rule.ruleId}' weight band has invalid exact money structure`
            });
          } else if (rule.baseRateExact && isValidExactMoney(rule.baseRateExact)) {
            if (bandMoney.currency !== rule.baseRateExact.currency || bandMoney.exponent !== rule.baseRateExact.exponent) {
              anomalies.push({
                type: 'MONEY_CURRENCY_EXPONENT_MISMATCH',
                severity: 'CRITICAL',
                merchantScopeId,
                configVersion,
                ruleId: rule.ruleId,
                field: 'weightBandMoney',
                message: `Rule '${rule.ruleId}' weight band money (${bandMoney.currency}/${bandMoney.exponent}) does not match base rate (${rule.baseRateExact.currency}/${rule.baseRateExact.exponent})`
              });
            }
          }
        }
      }

      if (validBands.length > 1) {
        const sortedBands = [...validBands].sort((a, b) => a.minWeightGrams - b.minWeightGrams);
        for (let i = 0; i < sortedBands.length - 1; i++) {
          if (sortedBands[i].maxWeightGrams > sortedBands[i + 1].minWeightGrams) {
            anomalies.push({
              type: 'OVERLAPPING_WEIGHT_BANDS',
              severity: 'HIGH',
              merchantScopeId,
              configVersion,
              ruleId: rule.ruleId,
              band1: { min: sortedBands[i].minWeightGrams, max: sortedBands[i].maxWeightGrams },
              band2: { min: sortedBands[i + 1].minWeightGrams, max: sortedBands[i + 1].maxWeightGrams },
              message: `Rule '${rule.ruleId}' has overlapping weight bands: (${sortedBands[i].minWeightGrams}-${sortedBands[i].maxWeightGrams}) and (${sortedBands[i + 1].minWeightGrams}-${sortedBands[i + 1].maxWeightGrams})`
            });
          }
        }
      }
    }
  }

  return anomalies;
}

async function runInventory(db) {
  const collections = await db.listCollections().toArray();
  const collectionNames = new Set(collections.map((c) => c.name));

  const indexStatus = [];

  for (const targetIndex of TARGET_INDEXES) {
    const colExists = collectionNames.has(targetIndex.collectionName);
    let isPresent = false;
    let indexDetails = null;

    if (colExists) {
      const indexes = await db.collection(targetIndex.collectionName).indexes();
      const match = findIndexMatch(indexes, targetIndex);
      if (match) {
        isPresent = true;
        indexDetails = match;
      }
    }

    indexStatus.push({
      modelName: targetIndex.modelName,
      collectionName: targetIndex.collectionName,
      indexName: targetIndex.name,
      collectionExists: colExists,
      isPresent,
      indexDetails
    });
  }

  const anomalies = await inspectPreflightAnomalies(db);

  return {
    migrationId: MIGRATION_ID,
    totalTargetIndexes: TARGET_INDEXES.length,
    presentIndexes: indexStatus.filter((s) => s.isPresent).length,
    missingIndexes: indexStatus.filter((s) => !s.isPresent).length,
    indexStatus,
    anomalies
  };
}

async function runApply(db, { target = 'staging' } = {}) {
  const collections = await db.listCollections().toArray();
  const collectionNames = new Set(collections.map((c) => c.name));

  const applied = [];
  const skipped = [];

  for (const targetIndex of TARGET_INDEXES) {
    if (!collectionNames.has(targetIndex.collectionName)) {
      await db.createCollection(targetIndex.collectionName);
      collectionNames.add(targetIndex.collectionName);
    }

    const col = db.collection(targetIndex.collectionName);
    const existingIndexes = await col.indexes();
    const match = findIndexMatch(existingIndexes, targetIndex);

    if (match) {
      skipped.push({ name: targetIndex.name, reason: 'ALREADY_EXISTS' });
    } else {
      await col.createIndex(targetIndex.key, targetIndex.options);
      applied.push({ name: targetIndex.name, collection: targetIndex.collectionName });
    }
  }

  try {
    let state = await MigrationState.findOne({ migrationId: MIGRATION_ID, target });
    if (!state) {
      state = new MigrationState({ migrationId: MIGRATION_ID, target });
    }
    const existingCreated = Array.isArray(state.createdIndexes) ? state.createdIndexes : [];
    const newlyCreated = applied.map((a) => `${a.collection}.${a.name}`);
    state.createdIndexes = Array.from(new Set([...existingCreated, ...newlyCreated]));
    state.status = 'APPLIED';
    state.metadata = {
      targetIndexes: TARGET_INDEXES.map((t) => t.name),
      appliedCount: applied.length,
      skippedCount: skipped.length,
      lastAppliedAt: new Date()
    };
    await state.save();
  } catch (_err) {
    // MigrationState tracking is skipped in unit tests / detached mode without collection
  }

  return { applied, skipped };
}

async function runRollback(db, { target = 'staging' } = {}) {
  const state = await MigrationState.findOne({ migrationId: MIGRATION_ID, target });
  if (!state || !Array.isArray(state.createdIndexes) || state.createdIndexes.length === 0) {
    throw new Error(`Rollback refused: Rollout ownership cannot be proven (no record in MigrationState of indexes created for migration '${MIGRATION_ID}' on target '${target}'). Manual operator review required.`);
  }

  const collections = await db.listCollections().toArray();
  const collectionNames = new Set(collections.map((c) => c.name));

  const dropped = [];
  const skipped = [];

  for (const entry of state.createdIndexes) {
    const [collName, indexName] = entry.split('.');
    if (indexName === '_id_') {
      skipped.push({ name: '_id_', reason: 'PRIMARY_INDEX' });
      continue;
    }
    if (!collectionNames.has(collName)) {
      skipped.push({ name: indexName, collection: collName, reason: 'COLLECTION_NOT_FOUND' });
      continue;
    }

    const col = db.collection(collName);
    const existingIndexes = await col.indexes();
    const match = existingIndexes.find((idx) => idx.name === indexName);

    if (match) {
      await col.dropIndex(match.name);
      dropped.push({ name: match.name, collection: collName });
    } else {
      skipped.push({ name: indexName, collection: collName, reason: 'NOT_FOUND' });
    }
  }

  state.status = 'ROLLED_BACK';
  state.rolledBackAt = new Date();
  await state.save();

  return { dropped, skipped };
}

async function runVerify(db) {
  const inventory = await runInventory(db);
  const verification = inventory.indexStatus.map((idx) => ({
    name: idx.indexName,
    collection: idx.collectionName,
    verified: idx.isPresent
  }));

  const allVerified = verification.every((v) => v.verified);
  return { verification, allVerified, anomalies: inventory.anomalies };
}

async function runMigration(cliArgs = process.argv.slice(2)) {
  const parsed = parseMigrationCli(cliArgs, {
    allowedModes: ALLOWED_MODES,
    allowedFlags: ALLOWED_FLAGS,
    defaultMode: '--dry-run'
  });

  const { target, mode, flags, modeKey, hasAllowLocal } = parsed;

  const key = modeKey || mode.replace(/^--/, '');
  const requiredConfirmations = (REQUIRED_CONFIRMATION_MAP[key] && REQUIRED_CONFIRMATION_MAP[key][target]) || [];
  for (const req of requiredConfirmations) {
    if (!flags.includes(req)) {
      throw new MigrationGuardError(
        'CONFIRMATION_REQUIRED',
        `Missing required confirmation flag '${req}' for mode '${mode}' on target '${target}'`
      );
    }
  }

  const dbConfig = validateTargetAndDbConfig({ target, hasAllowLocal });
  await mongoose.connect(dbConfig.mongoUri, dbConfig.mongooseOptions);
  const db = mongoose.connection.db;

  try {
    if (mode === 'inventory' || mode === 'dry-run') {
      const report = await runInventory(db);
      return { mode, target, success: true, report };
    }

    if (mode === 'apply') {
      const applyResult = await runApply(db, { target });
      return { mode, target, success: true, applyResult };
    }

    if (mode === 'verify') {
      const verifyResult = await runVerify(db);
      return { mode, target, success: verifyResult.allVerified, verifyResult };
    }

    if (mode === 'finalize') {
      const verifyResult = await runVerify(db);
      if (!verifyResult.allVerified) {
        throw new Error('Cannot finalize migration: Indexes are not fully verified');
      }

      await MigrationState.findOneAndUpdate(
        { migrationId: MIGRATION_ID, target },
        {
          migrationId: MIGRATION_ID,
          target,
          status: 'COMPLETED',
          appliedAt: new Date(),
          verifiedAt: new Date(),
          metadata: { targetIndexes: TARGET_INDEXES.map((t) => t.name) }
        },
        { upsert: true, new: true }
      );

      return { mode, target, success: true, finalized: true };
    }

    if (mode === 'rollback') {
      const rollbackResult = await runRollback(db, { target });
      return { mode, target, success: true, rollbackResult };
    }

    throw new Error(`Unsupported mode: ${mode}`);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = {
  MIGRATION_ID,
  TARGET_INDEXES,
  findIndexMatch,
  inspectPreflightAnomalies,
  runInventory,
  runApply,
  runRollback,
  runVerify,
  runMigration
};

if (require.main === module) {
  runMigration()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

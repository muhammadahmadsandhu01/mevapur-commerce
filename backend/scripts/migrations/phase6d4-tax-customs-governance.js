#!/usr/bin/env node
'use strict';

/**
 * @file phase6d4-tax-customs-governance.js
 * @description Guarded, idempotent index and invariant migration for Phase 6D-4 Tax and Customs Governance,
 * Multi-Service Rate Calculation, Incoterms, and De-Minimis Decisions.
 *
 * Supported modes:
 *   --inventory : Read-only evaluation and status breakdown.
 *   --dry-run   : Read-only simulation of index creations and document migrations (default).
 *   --apply     : Bounded creation of scoped indexes and exact-money backfills.
 *   --verify    : Read-only verification scan.
 *   --finalize  : Separately authorized write of MigrationState completion evidence.
 *   --rollback  : Idempotent rollback of migration-owned indexes only (no data deleted).
 */

const mongoose = require('mongoose');
const MigrationState = require('../../models/MigrationState');
const Coupon = require('../../models/Coupon');
const Order = require('../../models/Order');
const Return = require('../../models/Return');
const Refund = require('../../models/Refund');
const Payment = require('../../models/Payment');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const { CountryRegistry, CurrencyRegistry, Money, MoneyMapper } = require('../../modules/commerce');
const {
  MigrationGuardError,
  parseMigrationCli,
  validateTargetAndDbConfig
} = require('../lib/migrationRuntimeGuard');

const MIGRATION_ID = 'phase6d4-tax-customs-governance';

const ALLOWED_MODES = ['--inventory', '--dry-run', '--apply', '--verify', '--finalize', '--rollback'];
const ALLOWED_FLAGS = [
  '--confirm-phase6d4-apply',
  '--confirm-phase6d4-finalize',
  '--confirm-phase6d4-rollback',
  '--confirm-production',
  '--allow-local',
  '--batch-size=',
  '--merchant-scope=',
  '--json'
];

const REQUIRED_CONFIRMATION_MAP = {
  apply: {
    staging: ['--confirm-phase6d4-apply'],
    production: ['--confirm-phase6d4-apply', '--confirm-production'],
    local: ['--confirm-phase6d4-apply']
  },
  finalize: {
    staging: ['--confirm-phase6d4-finalize'],
    production: ['--confirm-phase6d4-finalize', '--confirm-production'],
    local: ['--confirm-phase6d4-finalize']
  },
  rollback: {
    staging: ['--confirm-phase6d4-rollback'],
    production: ['--confirm-phase6d4-rollback', '--confirm-production'],
    local: ['--confirm-phase6d4-rollback']
  }
};

const TARGET_INDEXES = [
  // Order lookup indexes for Phase 6D-4
  {
    modelName: 'Order',
    collectionName: 'orders',
    key: { 'taxesAndDuties.provenance.ruleId': 1 },
    name: 'order_tax_rule_id_lookup_idx',
    options: {
      name: 'order_tax_rule_id_lookup_idx',
      partialFilterExpression: { 'taxesAndDuties.provenance.ruleId': { $type: 'string', $gt: '' } }
    }
  },
  {
    modelName: 'Order',
    collectionName: 'orders',
    key: { 'taxesAndDuties.incoterm': 1 },
    name: 'order_incoterm_lookup_idx',
    options: {
      name: 'order_incoterm_lookup_idx',
      partialFilterExpression: { 'taxesAndDuties.incoterm': { $type: 'string', $gt: '' } }
    }
  },
  // Return indexes
  {
    modelName: 'Return',
    collectionName: 'returns',
    key: { 'refundAllocationSnapshot.incoterm': 1 },
    name: 'return_refund_incoterm_idx',
    options: {
      name: 'return_refund_incoterm_idx',
      partialFilterExpression: { 'refundAllocationSnapshot.incoterm': { $type: 'string', $gt: '' } }
    }
  },
  // Refund indexes
  {
    modelName: 'Refund',
    collectionName: 'refunds',
    key: { 'allocationSnapshot.incoterm': 1 },
    name: 'refund_incoterm_idx',
    options: {
      name: 'refund_incoterm_idx',
      partialFilterExpression: { 'allocationSnapshot.incoterm': { $type: 'string', $gt: '' } }
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
  if (typeof money.amountMinor === 'number') return false;
  let amountStr = '';
  if (money.amountMinor != null) {
    if (typeof money.amountMinor === 'object' && typeof money.amountMinor.toString === 'function') {
      amountStr = money.amountMinor.toString().trim();
    } else if (typeof money.amountMinor === 'string') {
      amountStr = money.amountMinor.trim();
    } else {
      return false;
    }
  } else {
    return false;
  }
  if (!/^\d{1,18}$/.test(amountStr)) return false;
  if (typeof money.currency !== 'string' || !/^[A-Z]{3}$/.test(money.currency.trim())) return false;
  if (money.exponent == null || typeof money.exponent !== 'number' || !Number.isInteger(money.exponent) || money.exponent < 0 || money.exponent > 4) return false;
  return true;
}

/**
 * Inspects tax and customs rules in configuration for preflight anomalies.
 */
async function inspectPreflightAnomalies(dbOrRules) {
  const anomalies = [];
  let configs = [];

  if (Array.isArray(dbOrRules)) {
    configs = [{ version: 1, merchantScopeId: 'default', taxRules: dbOrRules }];
  } else if (dbOrRules && typeof dbOrRules.collection === 'function') {
    const configCol = dbOrRules.collection('commerceconfigurationversions');
    configs = await configCol.find({ status: 'active' }).toArray();
  } else if (dbOrRules && (Array.isArray(dbOrRules.taxRules) || dbOrRules.version != null)) {
    configs = [dbOrRules];
  }

  for (const cfg of configs) {
    const merchantScopeId = cfg.merchantScopeId || 'default';
    const configVersion = cfg.version != null ? cfg.version : 1;
    const seenRuleIds = new Set();
    const activeRules = (cfg.taxRules || []).filter((r) => r.enabled !== false);

    for (const rule of (cfg.taxRules || [])) {
      if (seenRuleIds.has(rule.ruleId)) {
        anomalies.push({
          type: 'DUPLICATE_RULE_ID',
          severity: 'CRITICAL',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          message: `Duplicate tax rule ID '${rule.ruleId}' in configuration version ${configVersion}`
        });
      }
      seenRuleIds.add(rule.ruleId);

      if (!rule.destinationCountry || !CountryRegistry.hasCountry(rule.destinationCountry)) {
        anomalies.push({
          type: 'INVALID_DESTINATION_COUNTRY',
          severity: 'HIGH',
          merchantScopeId,
          configVersion,
          ruleId: rule.ruleId,
          country: rule.destinationCountry,
          message: `Tax rule '${rule.ruleId}' has invalid destination country '${rule.destinationCountry}'`
        });
      }

      if (rule.enabled !== false) {
        if (rule.verificationStatus === 'UNVERIFIED_ESTIMATE') {
          anomalies.push({
            type: 'UNVERIFIED_RULE_IN_ACTIVE_CONFIG',
            severity: 'CRITICAL',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            message: `Active tax rule '${rule.ruleId}' has UNVERIFIED_ESTIMATE status; verified legal rule required`
          });
        }

        if (!rule.dutyRefundPolicy) {
          anomalies.push({
            type: 'MISSING_DUTY_REFUND_POLICY',
            severity: 'CRITICAL',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            message: `Active tax rule '${rule.ruleId}' is missing explicit dutyRefundPolicy`
          });
        }

        if (!rule.taxRefundPolicy) {
          anomalies.push({
            type: 'MISSING_TAX_REFUND_POLICY',
            severity: 'CRITICAL',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            message: `Active tax rule '${rule.ruleId}' is missing explicit taxRefundPolicy`
          });
        }

        if (rule.customsValueIncludesShipping == null) {
          anomalies.push({
            type: 'MISSING_CUSTOMS_SHIPPING_INCLUSION',
            severity: 'CRITICAL',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            message: `Active tax rule '${rule.ruleId}' is missing explicit customsValueIncludesShipping boolean`
          });
        }

        if (rule.customsValueIncludesInsurance == null) {
          anomalies.push({
            type: 'MISSING_CUSTOMS_INSURANCE_INCLUSION',
            severity: 'CRITICAL',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            message: `Active tax rule '${rule.ruleId}' is missing explicit customsValueIncludesInsurance boolean`
          });
        }

        if (!rule.sourceAuthority || !rule.sourceReference) {
          anomalies.push({
            type: 'MISSING_SOURCE_PROVENANCE',
            severity: 'HIGH',
            merchantScopeId,
            configVersion,
            ruleId: rule.ruleId,
            message: `Active tax rule '${rule.ruleId}' is missing sourceAuthority or sourceReference`
          });
        }
      }
    }

    // Check route ambiguity (same country + subdivision)
    const routeMap = new Map();
    for (const rule of activeRules) {
      const key = `${rule.destinationCountry}:${rule.destinationSubdivision || '*'}`;
      if (routeMap.has(key)) {
        anomalies.push({
          type: 'AMBIGUOUS_ROUTE_OVERLAP',
          severity: 'CRITICAL',
          merchantScopeId,
          configVersion,
          route: key,
          ruleIds: [routeMap.get(key), rule.ruleId],
          message: `Conflicting active tax rules for route '${key}': '${routeMap.get(key)}' and '${rule.ruleId}'`
        });
      } else {
        routeMap.set(key, rule.ruleId);
      }
    }
  }

  return anomalies;
}

/**
 * Reconciles/backfills legacy coupons with canonical rational and exact fields.
 * Strictly idempotent, tenant-safe, and bounded.
 *
 * @param {object} options
 * @param {boolean} options.isApply
 * @param {number} [options.batchSize=100]
 * @param {object} [options.db]
 * @returns {Promise<object>}
 */
async function migrateCouponsBatch({ isApply = false, batchSize = 100, db = null } = {}) {
  const result = {
    entity: 'Coupon',
    processed: 0,
    eligible: 0,
    changed: 0,
    skipped: 0,
    failed: 0,
    alreadyCompliant: 0,
    manualReview: 0,
    anomalies: []
  };

  const couponModel = db ? db.model('Coupon') : Coupon;
  const cursor = couponModel.find({}).sort({ _id: 1 }).limit(batchSize);
  const coupons = await cursor.exec();

  for (const coupon of coupons) {
    result.processed++;
    let needsUpdate = false;
    const updates = {};

    if (coupon.type === 'percentage') {
      if (coupon.rateNumerator != null && coupon.rateDenominator != null) {
        result.alreadyCompliant++;
      } else if (typeof coupon.value === 'number' && Number.isFinite(coupon.value) && coupon.value >= 0 && coupon.value <= 100) {
        // Safe integer percentage conversion without floating-point errors
        const percentageScaled = Math.round(coupon.value * 100);
        if (Number.isInteger(percentageScaled) && percentageScaled >= 0 && percentageScaled <= 10000) {
          updates.rateNumerator = percentageScaled;
          updates.rateDenominator = 10000;
          needsUpdate = true;
          result.eligible++;
        } else {
          result.manualReview++;
          result.anomalies.push({
            type: 'UNSAFE_COUPON_PERCENTAGE_VALUE',
            couponId: String(coupon._id),
            code: coupon.code,
            value: coupon.value
          });
        }
      } else {
        result.manualReview++;
        result.anomalies.push({
          type: 'INVALID_COUPON_PERCENTAGE_VALUE',
          couponId: String(coupon._id),
          code: coupon.code,
          value: coupon.value
        });
      }
    } else if (coupon.type === 'fixed') {
      if (isValidExactMoney(coupon.valueExact)) {
        result.alreadyCompliant++;
      } else {
        const currency = coupon.currency || 'PKR';
        if (!CurrencyRegistry.hasCurrency(currency)) {
          result.manualReview++;
          result.anomalies.push({
            type: 'INVALID_COUPON_CURRENCY',
            couponId: String(coupon._id),
            code: coupon.code,
            currency
          });
        } else if (typeof coupon.value === 'number' && Number.isFinite(coupon.value) && coupon.value >= 0) {
          try {
            updates.valueExact = MoneyMapper.fromLegacy(coupon.value, currency);
            needsUpdate = true;
            result.eligible++;
          } catch (_err) {
            result.manualReview++;
          }
        } else {
          result.manualReview++;
        }
      }
    } else if (coupon.type === 'freeshipping') {
      result.alreadyCompliant++;
    }

    if (needsUpdate) {
      if (isApply) {
        await couponModel.updateOne({ _id: coupon._id }, { $set: updates });
        result.changed++;
      } else {
        // Dry-run mode: count as eligible but zero database writes
        result.skipped++;
      }
    }
  }

  return result;
}

/**
 * Reconciles/backfills legacy orders with canonical tax and customs snapshots where unambiguous.
 * Strictly idempotent, tenant-isolated, and bounded.
 *
 * @param {object} options
 * @param {boolean} options.isApply
 * @param {number} [options.batchSize=100]
 * @param {string} [options.merchantScopeId]
 * @param {object} [options.db]
 * @returns {Promise<object>}
 */
async function migrateOrdersBatch({ isApply = false, batchSize = 100, merchantScopeId = null, db = null } = {}) {
  const result = {
    entity: 'Order',
    processed: 0,
    eligible: 0,
    changed: 0,
    skipped: 0,
    failed: 0,
    alreadyCompliant: 0,
    manualReview: 0,
    anomalies: []
  };

  const orderModel = db ? db.model('Order') : Order;
  const query = {};
  if (merchantScopeId) {
    query['quote.merchantScopeId'] = merchantScopeId;
  }

  const cursor = orderModel.find(query).sort({ _id: 1 }).limit(batchSize);
  const orders = await cursor.exec();

  for (const order of orders) {
    result.processed++;
    let needsUpdate = false;
    const updates = {};

    const currency = order.currency || (order.shippingAddress && order.shippingAddress.countryCode === 'PK' ? 'PKR' : null);
    if (!currency || !CurrencyRegistry.hasCurrency(currency)) {
      result.manualReview++;
      result.anomalies.push({
        type: 'UNRESOLVABLE_ORDER_CURRENCY',
        orderId: order.orderId || String(order._id),
        currency: order.currency
      });
      continue;
    }

    const taxesAndDuties = order.taxesAndDuties || {};

    // Check DAP anomaly: DAP order must never collect payable duty in order total
    const incoterm = taxesAndDuties.incoterm || (order.shippingAddress && order.shippingAddress.countryCode === 'PK' ? 'DOMESTIC' : null);
    if (incoterm === 'DAP') {
      const payableDutyNum = taxesAndDuties.payableDutyAmount || 0;
      const payableDutyExactMinor = taxesAndDuties.payableDutyExact?.amountMinor ? BigInt(taxesAndDuties.payableDutyExact.amountMinor) : 0n;
      if (payableDutyNum > 0 || payableDutyExactMinor > 0n) {
        result.manualReview++;
        result.anomalies.push({
          type: 'DAP_NONZERO_PAYABLE_DUTY_ANOMALY',
          orderId: order.orderId || String(order._id),
          payableDutyAmount: payableDutyNum,
          payableDutyExactMinor: String(payableDutyExactMinor),
          message: 'DAP order has non-zero payable duty collected; requires manual financial review'
        });
      }
    }

    // Check exact snapshot compliance
    const hasExactTaxes = isValidExactMoney(taxesAndDuties.taxAmountExact);
    const hasExactSubtotal = isValidExactMoney(order.subtotalExact);
    const hasExactTotal = isValidExactMoney(order.totalAmountExact);

    if (hasExactTaxes && hasExactSubtotal && hasExactTotal) {
      result.alreadyCompliant++;
    } else {
      // Check if we can authoritatively backfill exact money from integer legacy numbers
      if (!hasExactSubtotal && typeof order.subtotal === 'number' && Number.isFinite(order.subtotal) && order.subtotal >= 0) {
        try {
          updates.subtotalExact = MoneyMapper.fromLegacy(order.subtotal, currency);
          needsUpdate = true;
        } catch (_err) {
          result.manualReview++;
        }
      }

      if (!hasExactTotal && typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount) && order.totalAmount >= 0) {
        try {
          updates.totalAmountExact = MoneyMapper.fromLegacy(order.totalAmount, currency);
          needsUpdate = true;
        } catch (_err) {
          result.manualReview++;
        }
      }

      if (needsUpdate) {
        result.eligible++;
        if (isApply) {
          await orderModel.updateOne({ _id: order._id }, { $set: updates });
          result.changed++;
        } else {
          result.skipped++;
        }
      } else {
        result.alreadyCompliant++;
      }
    }
  }

  return result;
}

/**
 * Reconciles/backfills Returns and Refunds for exact math integrity.
 */
async function migrateReturnsAndRefundsBatch({ isApply = false, batchSize = 100, db = null } = {}) {
  const result = {
    entity: 'Return/Refund',
    processed: 0,
    eligible: 0,
    changed: 0,
    skipped: 0,
    failed: 0,
    alreadyCompliant: 0,
    manualReview: 0,
    anomalies: []
  };

  const refundModel = db ? db.model('Refund') : Refund;
  const cursor = refundModel.find({}).sort({ _id: 1 }).limit(batchSize);
  const refunds = await cursor.exec();

  for (const ref of refunds) {
    result.processed++;
    if (isValidExactMoney(ref.amountExact)) {
      // Validate component exact sum if snapshot exists
      if (ref.allocationSnapshot && isValidExactMoney(ref.allocationSnapshot.totalRefundExact)) {
        const merch = ref.allocationSnapshot.merchandiseRefundExact?.amountMinor ? BigInt(ref.allocationSnapshot.merchandiseRefundExact.amountMinor) : 0n;
        const tax = ref.allocationSnapshot.taxRefundExact?.amountMinor ? BigInt(ref.allocationSnapshot.taxRefundExact.amountMinor) : 0n;
        const duty = ref.allocationSnapshot.dutyRefundExact?.amountMinor ? BigInt(ref.allocationSnapshot.dutyRefundExact.amountMinor) : 0n;
        const shipping = ref.allocationSnapshot.shippingRefundExact?.amountMinor ? BigInt(ref.allocationSnapshot.shippingRefundExact.amountMinor) : 0n;
        const total = BigInt(ref.allocationSnapshot.totalRefundExact.amountMinor);

        if (merch + tax + duty + shipping !== total) {
          result.manualReview++;
          result.anomalies.push({
            type: 'REFUND_COMPONENT_EXACT_SUM_MISMATCH',
            refundId: String(ref._id),
            refundNumber: ref.refundNumber,
            merch: String(merch),
            tax: String(tax),
            duty: String(duty),
            shipping: String(shipping),
            total: String(total)
          });
        } else {
          result.alreadyCompliant++;
        }
      } else {
        result.alreadyCompliant++;
      }
    } else {
      result.manualReview++;
    }
  }

  return result;
}

/**
 * Main migration execution controller.
 */
async function runMigration(argv = process.argv.slice(2)) {
  const cli = parseMigrationCli(argv, {
    allowedModes: ALLOWED_MODES,
    allowedFlags: ALLOWED_FLAGS,
    requiredConfirmationMap: REQUIRED_CONFIRMATION_MAP
  });

  const dbConfig = validateTargetAndDbConfig({
    target: cli.target,
    hasAllowLocal: cli.hasAllowLocal,
    env: process.env
  });

  console.log(`[Phase 6D-4 Migration] Target: ${cli.target}, Mode: ${cli.mode}, DB Fingerprint: ${dbConfig.sanitizedFingerprint}`);

  let batchSize = 100;
  for (const f of cli.flags) {
    if (f.startsWith('--batch-size=')) {
      const val = parseInt(f.slice('--batch-size='.length), 10);
      if (!isNaN(val) && val > 0 && val <= 1000) batchSize = val;
    }
  }

  let merchantScopeId = null;
  for (const f of cli.flags) {
    if (f.startsWith('--merchant-scope=')) {
      merchantScopeId = f.slice('--merchant-scope='.length).trim();
    }
  }

  const isJson = cli.hasFlag('--json');

  if (cli.isDryRun) {
    console.log('[Phase 6D-4 Migration] DRY RUN MODE: No writes will be performed.');
  }

  const report = {
    migrationId: MIGRATION_ID,
    target: cli.target,
    mode: cli.mode,
    isDryRun: cli.isDryRun,
    isApply: cli.isApply,
    timestamp: new Date().toISOString(),
    batchSize,
    merchantScopeId,
    indexes: {
      target: TARGET_INDEXES.length,
      verified: 0,
      missing: 0,
      created: 0
    },
    preflightAnomalies: [],
    coupons: null,
    orders: null,
    refunds: null,
    success: true
  };

  // Connect to DB if not already connected
  let didConnect = false;
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(dbConfig.mongoUri, { serverSelectionTimeoutMS: 15000 });
    didConnect = true;
  }

  try {
    const db = mongoose.connection.db;

    // 1. Inspect preflight tax rule configuration anomalies
    report.preflightAnomalies = await inspectPreflightAnomalies(db);

    // 2. Index Management
    for (const targetIdx of TARGET_INDEXES) {
      try {
        const col = db.collection(targetIdx.collectionName);
        const existingIndexes = await col.indexes();
        const match = findIndexMatch(existingIndexes, targetIdx, targetIdx.name);

        if (match) {
          report.indexes.verified++;
        } else {
          report.indexes.missing++;
          if (cli.isApply) {
            await col.createIndex(targetIdx.key, targetIdx.options);
            report.indexes.created++;
          }
        }
      } catch (err) {
        report.success = false;
        report.indexes.missing++;
      }
    }

    // 3. Document Migrations
    report.coupons = await migrateCouponsBatch({ isApply: cli.isApply, batchSize });
    report.orders = await migrateOrdersBatch({ isApply: cli.isApply, batchSize, merchantScopeId });
    report.refunds = await migrateReturnsAndRefundsBatch({ isApply: cli.isApply, batchSize });

    // 4. Finalize Mode
    if (cli.hasFlag('--finalize') || (cli.mode === '--finalize')) {
      if (report.preflightAnomalies.filter((a) => a.severity === 'CRITICAL').length > 0) {
        throw new Error('Cannot finalize migration with critical preflight anomalies.');
      }
      if (cli.isApply) {
        await MigrationState.updateOne(
          { migrationId: MIGRATION_ID },
          {
            $set: {
              status: 'COMPLETED',
              completedAt: new Date(),
              metadata: {
                target: cli.target,
                indexesCreated: report.indexes.created,
                couponsMigrated: report.coupons.changed,
                ordersMigrated: report.orders.changed
              }
            }
          },
          { upsert: true }
        );
      }
    }

    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`[Phase 6D-4 Migration] Completed with status: ${report.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`  Indexes: ${report.indexes.verified} verified, ${report.indexes.missing} missing, ${report.indexes.created} created`);
      console.log(`  Coupons: processed=${report.coupons.processed}, changed=${report.coupons.changed}, manualReview=${report.coupons.manualReview}`);
      console.log(`  Orders: processed=${report.orders.processed}, changed=${report.orders.changed}, manualReview=${report.orders.manualReview}`);
      console.log(`  Refunds: processed=${report.refunds.processed}, alreadyCompliant=${report.refunds.alreadyCompliant}, manualReview=${report.refunds.manualReview}`);
    }

    return report;
  } finally {
    if (didConnect) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  runMigration()
    .then((report) => {
      process.exit(report && report.success ? 0 : 1);
    })
    .catch((err) => {
      console.error(`[Phase 6D-4 Migration Error] ${err.message}`);
      process.exit(err instanceof MigrationGuardError ? 2 : 1);
    });
}

module.exports = {
  MIGRATION_ID,
  TARGET_INDEXES,
  findIndexMatch,
  isValidExactMoney,
  inspectPreflightAnomalies,
  migrateCouponsBatch,
  migrateOrdersBatch,
  migrateReturnsAndRefundsBatch,
  runMigration
};

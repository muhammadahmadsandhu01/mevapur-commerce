/**
 * @file taxGovernanceReconciliation.js
 * @description Operational read-only reconciliation script for tax & customs governance rules,
 * legal policies, de-minimis threshold compliance, coupon rational authority, and order/refund exact-money snapshots.
 */

'use strict';

const mongoose = require('mongoose');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const Coupon = require('../../models/Coupon');
const Order = require('../../models/Order');
const Return = require('../../models/Return');
const Refund = require('../../models/Refund');
const Payment = require('../../models/Payment');
const { CountryRegistry, CurrencyRegistry } = require('../../modules/commerce');
const {
  MigrationGuardError,
  parseMigrationCli,
  validateTargetAndDbConfig
} = require('../lib/migrationRuntimeGuard');

const EXIT_CODE = {
  SUCCESS: 0,
  DISCREPANCIES_FOUND: 1,
  CLI_ERROR: 2,
  RUNTIME_ERROR: 3
};

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
 * Reconciles tax & customs governance for a single merchant scope.
 * Strictly read-only: performs zero database mutations.
 *
 * @param {string} merchantScopeId
 * @param {object} [options]
 * @returns {Promise<object>} Single tenant reconciliation report
 */
async function reconcileSingleTenant(merchantScopeId, options = {}) {
  const scope = String(merchantScopeId || '').trim();
  const anomalies = [];
  const uncoveredCountries = [];

  if (!scope) {
    anomalies.push({
      type: 'MISSING_MERCHANT_SCOPE',
      severity: 'CRITICAL',
      message: 'merchantScopeId must be provided and non-empty'
    });
    return {
      success: false,
      merchantScopeId: scope,
      anomalies
    };
  }

  // 1. Audit active CommerceConfigurationVersion
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
  const taxRules = activeVersion.taxRules || [];

  // Check destination country coverage
  const coveredDestinations = new Set(
    taxRules.filter((r) => r.enabled !== false).map((r) => r.destinationCountry)
  );

  for (const country of enabledCountries) {
    if (!coveredDestinations.has(country)) {
      uncoveredCountries.push(country);
      anomalies.push({
        type: 'UNCOVERED_ENABLED_COUNTRY',
        severity: 'HIGH',
        merchantScopeId: scope,
        country,
        message: `Enabled country '${country}' has no active tax rule in version ${activeVersion.version}`
      });
    }
  }

  // Check rule legal policies & de-minimis integrity
  const routeMap = new Map();
  for (const rule of taxRules) {
    if (rule.enabled !== false) {
      if (rule.verificationStatus === 'UNVERIFIED_ESTIMATE') {
        anomalies.push({
          type: 'UNVERIFIED_TAX_RULE',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          ruleId: rule.ruleId,
          message: `Active tax rule '${rule.ruleId}' has UNVERIFIED_ESTIMATE status; verified legal rule required`
        });
      }

      if (!rule.dutyRefundPolicy) {
        anomalies.push({
          type: 'MISSING_DUTY_REFUND_POLICY',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          ruleId: rule.ruleId,
          message: `Active tax rule '${rule.ruleId}' is missing explicit dutyRefundPolicy`
        });
      }

      if (!rule.taxRefundPolicy) {
        anomalies.push({
          type: 'MISSING_TAX_REFUND_POLICY',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          ruleId: rule.ruleId,
          message: `Active tax rule '${rule.ruleId}' is missing explicit taxRefundPolicy`
        });
      }

      if (rule.customsValueIncludesShipping == null) {
        anomalies.push({
          type: 'MISSING_CUSTOMS_SHIPPING_INCLUSION',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          ruleId: rule.ruleId,
          message: `Active tax rule '${rule.ruleId}' is missing explicit customsValueIncludesShipping`
        });
      }

      if (rule.customsValueIncludesInsurance == null) {
        anomalies.push({
          type: 'MISSING_CUSTOMS_INSURANCE_INCLUSION',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          ruleId: rule.ruleId,
          message: `Active tax rule '${rule.ruleId}' is missing explicit customsValueIncludesInsurance`
        });
      }

      // De-minimis threshold requires basis and comparison
      const hasDeMinimisThreshold = rule.customsDutyDeMinimisExact != null || rule.importTaxDeMinimisExact != null;
      if (hasDeMinimisThreshold) {
        if (!rule.deMinimisBasis || !rule.deMinimisComparison) {
          anomalies.push({
            type: 'INCOMPLETE_DEMINIMIS_CONFIGURATION',
            severity: 'CRITICAL',
            merchantScopeId: scope,
            ruleId: rule.ruleId,
            message: `Tax rule '${rule.ruleId}' specifies de-minimis threshold without explicit deMinimisBasis and deMinimisComparison`
          });
        }
      }

      // Route collision check
      const routeKey = `${rule.destinationCountry}:${rule.destinationSubdivision || '*'}`;
      if (routeMap.has(routeKey)) {
        anomalies.push({
          type: 'AMBIGUOUS_ROUTE_OVERLAP',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          route: routeKey,
          ruleIds: [routeMap.get(routeKey), rule.ruleId],
          message: `Ambiguous route collision on route '${routeKey}' between rules '${routeMap.get(routeKey)}' and '${rule.ruleId}'`
        });
      } else {
        routeMap.set(routeKey, rule.ruleId);
      }
    }
  }

  // 2. Audit Orders for this merchant scope
  const orderCursor = Order.find({ 'quote.merchantScopeId': scope }).lean();
  let ordersAudited = 0;
  for await (const order of orderCursor) {
    ordersAudited++;
    const taxesAndDuties = order.taxesAndDuties || {};
    const orderId = order.orderId || String(order._id);

    // Audit DAP payable duty
    if (taxesAndDuties.incoterm === 'DAP') {
      const payableDutyNum = taxesAndDuties.payableDutyAmount || 0;
      const payableDutyExactMinor = taxesAndDuties.payableDutyExact?.amountMinor ? BigInt(taxesAndDuties.payableDutyExact.amountMinor) : 0n;
      if (payableDutyNum > 0 || payableDutyExactMinor > 0n) {
        anomalies.push({
          type: 'DAP_NONZERO_PAYABLE_DUTY_ANOMALY',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          orderId,
          payableDutyAmount: payableDutyNum,
          payableDutyExactMinor: String(payableDutyExactMinor),
          message: `DAP order '${orderId}' has non-zero payable duty collected in order total`
        });
      }
    }

    // Audit DDP duty mismatch
    if (taxesAndDuties.incoterm === 'DDP') {
      const estimatedDuty = taxesAndDuties.estimatedDutyExact?.amountMinor ? BigInt(taxesAndDuties.estimatedDutyExact.amountMinor) : null;
      const payableDuty = taxesAndDuties.payableDutyExact?.amountMinor ? BigInt(taxesAndDuties.payableDutyExact.amountMinor) : null;
      if (estimatedDuty != null && payableDuty != null && estimatedDuty !== payableDuty) {
        anomalies.push({
          type: 'DDP_DUTY_MISMATCH',
          severity: 'HIGH',
          merchantScopeId: scope,
          orderId,
          estimatedDuty: String(estimatedDuty),
          payableDuty: String(payableDuty),
          message: `DDP order '${orderId}' payable duty does not equal estimated duty`
        });
      }
    }

    // Audit inclusive tax double add
    if (taxesAndDuties.taxTreatment === 'inclusive') {
      if (order.subtotalExact && order.taxAmountExact && order.totalAmountExact && (!order.shippingCostExact || order.shippingCostExact.amountMinor === '0') && (!order.discountExact || order.discountExact.amountMinor === '0')) {
        const subtotal = BigInt(order.subtotalExact.amountMinor);
        const tax = BigInt(order.taxAmountExact.amountMinor);
        const total = BigInt(order.totalAmountExact.amountMinor);
        if (tax > 0n && total === subtotal + tax) {
          anomalies.push({
            type: 'INCLUSIVE_TAX_DOUBLE_COUNTING_ANOMALY',
            severity: 'CRITICAL',
            merchantScopeId: scope,
            orderId,
            subtotal: String(subtotal),
            tax: String(tax),
            total: String(total),
            message: `Order '${orderId}' with inclusive tax has tax added on top of subtotal`
          });
        }
      }
    }

    // Audit 18-digit exact bounds
    const moneyFields = [
      ['subtotalExact', order.subtotalExact],
      ['totalAmountExact', order.totalAmountExact],
      ['taxAmountExact', order.taxAmountExact],
      ['dutiesExact', order.dutiesExact]
    ];
    for (const [name, val] of moneyFields) {
      if (val != null && !isValidExactMoney(val)) {
        anomalies.push({
          type: 'MALFORMED_EXACT_MONEY',
          severity: 'CRITICAL',
          merchantScopeId: scope,
          orderId,
          field: name,
          message: `Order '${orderId}' field '${name}' is not a valid 18-digit exact Money object`
        });
      }
    }
  }

  return {
    success: anomalies.filter((a) => a.severity === 'CRITICAL').length === 0,
    merchantScopeId: scope,
    activeVersionId: String(activeVersion._id),
    versionNumber: activeVersion.version,
    totalRules: taxRules.length,
    activeRules: taxRules.filter((r) => r.enabled !== false).length,
    coveredDestinations: Array.from(coveredDestinations),
    uncoveredCountries,
    ordersAudited,
    anomalies
  };
}

/**
 * Audits all coupons for rational authority and exact amounts.
 */
async function auditCoupons() {
  const anomalies = [];
  const couponCursor = Coupon.find({}).lean();
  let couponsAudited = 0;

  for await (const coupon of couponCursor) {
    couponsAudited++;
    const code = coupon.code;
    const id = String(coupon._id);

    if (coupon.type === 'percentage') {
      if (coupon.rateNumerator == null || coupon.rateDenominator == null) {
        anomalies.push({
          type: 'COUPON_MISSING_RATIONAL_AUTHORITY',
          severity: 'HIGH',
          couponId: id,
          code,
          message: `Percentage coupon '${code}' lacks canonical rateNumerator/rateDenominator`
        });
      } else if (coupon.rateNumerator < 0 || coupon.rateDenominator <= 0) {
        anomalies.push({
          type: 'COUPON_INVALID_RATIONAL_RATE',
          severity: 'CRITICAL',
          couponId: id,
          code,
          rateNumerator: coupon.rateNumerator,
          rateDenominator: coupon.rateDenominator,
          message: `Percentage coupon '${code}' has invalid rateNumerator or rateDenominator`
        });
      }
    } else if (coupon.type === 'fixed') {
      if (!coupon.valueExact || !isValidExactMoney(coupon.valueExact)) {
        anomalies.push({
          type: 'COUPON_MISSING_EXACT_AMOUNT',
          severity: 'HIGH',
          couponId: id,
          code,
          message: `Fixed discount coupon '${code}' lacks canonical valueExact Money object`
        });
      }
    }
  }

  return { couponsAudited, anomalies };
}

/**
 * Audits all returns and refunds for exact math and component sum integrity.
 */
async function auditReturnsAndRefunds() {
  const anomalies = [];
  const refundCursor = Refund.find({}).lean();
  let refundsAudited = 0;

  for await (const refund of refundCursor) {
    refundsAudited++;
    const refNum = refund.refundNumber;
    const refId = String(refund._id);

    if (refund.amountExact != null && !isValidExactMoney(refund.amountExact)) {
      anomalies.push({
        type: 'REFUND_MALFORMED_EXACT_AMOUNT',
        severity: 'CRITICAL',
        refundId: refId,
        refundNumber: refNum,
        message: `Refund '${refNum}' has malformed amountExact`
      });
    }

    if (refund.allocationSnapshot) {
      const snap = refund.allocationSnapshot;
      if (snap.totalRefundExact && isValidExactMoney(snap.totalRefundExact)) {
        const merch = snap.merchandiseRefundExact?.amountMinor ? BigInt(snap.merchandiseRefundExact.amountMinor) : 0n;
        const tax = snap.taxRefundExact?.amountMinor ? BigInt(snap.taxRefundExact.amountMinor) : 0n;
        const duty = snap.dutyRefundExact?.amountMinor ? BigInt(snap.dutyRefundExact.amountMinor) : 0n;
        const shipping = snap.shippingRefundExact?.amountMinor ? BigInt(snap.shippingRefundExact.amountMinor) : 0n;
        const total = BigInt(snap.totalRefundExact.amountMinor);

        if (merch + tax + duty + shipping !== total) {
          anomalies.push({
            type: 'REFUND_COMPONENT_SUM_MISMATCH',
            severity: 'CRITICAL',
            refundId: refId,
            refundNumber: refNum,
            merchandise: String(merch),
            tax: String(tax),
            duty: String(duty),
            shipping: String(shipping),
            total: String(total),
            message: `Refund '${refNum}' exact component sum (${merch + tax + duty + shipping}) does not equal totalRefundExact (${total})`
          });
        }
      }
    }
  }

  return { refundsAudited, anomalies };
}

/**
 * Audits payments for refund cap integrity.
 */
async function auditPayments() {
  const anomalies = [];
  const paymentCursor = Payment.find({}).select('+refundReservedAmount +refundReservedAmountExact').lean();
  let paymentsAudited = 0;

  for await (const payment of paymentCursor) {
    paymentsAudited++;
    const paymentId = String(payment._id);

    // Numeric refund cap check
    const captured = payment.capturedAmount || 0;
    const refunded = payment.refundedAmount || 0;
    const reserved = payment.refundReservedAmount || 0;

    if (refunded + reserved > captured && captured > 0) {
      anomalies.push({
        type: 'PAYMENT_REFUND_CAP_EXCEEDED',
        severity: 'CRITICAL',
        paymentId,
        captured,
        refunded,
        reserved,
        message: `Payment '${paymentId}' refund + reservation (${refunded + reserved}) exceeds captured amount (${captured})`
      });
    }

    // Exact money refund cap check
    if (payment.capturedAmountExact && isValidExactMoney(payment.capturedAmountExact)) {
      const capturedMinor = BigInt(payment.capturedAmountExact.amountMinor);
      const refundedMinor = payment.refundedAmountExact?.amountMinor ? BigInt(payment.refundedAmountExact.amountMinor) : 0n;
      const reservedMinor = payment.refundReservedAmountExact?.amountMinor ? BigInt(payment.refundReservedAmountExact.amountMinor) : 0n;

      if (refundedMinor + reservedMinor > capturedMinor && capturedMinor > 0n) {
        anomalies.push({
          type: 'PAYMENT_EXACT_REFUND_CAP_EXCEEDED',
          severity: 'CRITICAL',
          paymentId,
          capturedMinor: String(capturedMinor),
          refundedMinor: String(refundedMinor),
          reservedMinor: String(reservedMinor),
          message: `Payment '${paymentId}' exact refund + reservation exceeds captured amount`
        });
      }
    }
  }

  return { paymentsAudited, anomalies };
}

/**
 * Main tax reconciliation runner.
 */
async function runTaxReconciliation(argv = process.argv.slice(2)) {
  const args = Array.isArray(argv) ? argv : [];
  let merchantScopeId = null;
  let allTenants = false;
  let isJson = false;

  for (const arg of args) {
    if (arg.startsWith('--merchant-scope=')) {
      merchantScopeId = arg.slice('--merchant-scope='.length).trim();
    } else if (arg === '--all-tenants') {
      allTenants = true;
    } else if (arg === '--json') {
      isJson = true;
    }
  }

  if (!merchantScopeId && !allTenants) {
    return {
      success: false,
      exitCode: EXIT_CODE.CLI_ERROR,
      error: 'Either --merchant-scope=<id> or --all-tenants is required'
    };
  }

  const overallReport = {
    timestamp: new Date().toISOString(),
    merchantScopeId: merchantScopeId || 'ALL',
    tenantReports: [],
    couponsReport: null,
    refundsReport: null,
    paymentsReport: null,
    totalAnomalies: 0,
    criticalCount: 0,
    highCount: 0,
    success: true
  };

  try {
    let scopes = [];
    if (merchantScopeId) {
      scopes = [merchantScopeId];
    } else {
      const distinctScopes = await CommerceConfigurationVersion.distinct('merchantScopeId');
      scopes = distinctScopes.length > 0 ? distinctScopes : ['default'];
    }

    for (const scope of scopes) {
      const tenantReport = await reconcileSingleTenant(scope);
      overallReport.tenantReports.push(tenantReport);
    }

    overallReport.couponsReport = await auditCoupons();
    overallReport.refundsReport = await auditReturnsAndRefunds();
    overallReport.paymentsReport = await auditPayments();

    const allAnomalies = [
      ...overallReport.tenantReports.flatMap((t) => t.anomalies),
      ...overallReport.couponsReport.anomalies,
      ...overallReport.refundsReport.anomalies,
      ...overallReport.paymentsReport.anomalies
    ];

    overallReport.totalAnomalies = allAnomalies.length;
    overallReport.criticalCount = allAnomalies.filter((a) => a.severity === 'CRITICAL').length;
    overallReport.highCount = allAnomalies.filter((a) => a.severity === 'HIGH').length;
    overallReport.success = overallReport.criticalCount === 0;

    if (isJson) {
      console.log(JSON.stringify(overallReport, null, 2));
    } else {
      console.log(`[Phase 6D-4 Tax Reconciliation] Completed. Total Anomalies: ${overallReport.totalAnomalies} (Critical: ${overallReport.criticalCount}, High: ${overallReport.highCount})`);
    }

    return {
      success: overallReport.success,
      exitCode: overallReport.criticalCount > 0 ? EXIT_CODE.DISCREPANCIES_FOUND : EXIT_CODE.SUCCESS,
      report: overallReport
    };
  } catch (err) {
    console.error(`[Tax Reconciliation Error] ${err.message}`);
    return {
      success: false,
      exitCode: EXIT_CODE.RUNTIME_ERROR,
      error: err.message
    };
  }
}

if (require.main === module) {
  const cli = parseMigrationCli(process.argv.slice(2), {
    allowedModes: ['--dry-run', '--apply'],
    allowedFlags: ['--merchant-scope=', '--all-tenants', '--json', '--allow-local', '--confirm-production']
  });

  const dbConfig = validateTargetAndDbConfig({
    target: cli.target,
    hasAllowLocal: cli.hasAllowLocal,
    env: process.env
  });

  mongoose.connect(dbConfig.mongoUri, { serverSelectionTimeoutMS: 15000 })
    .then(() => runTaxReconciliation(process.argv.slice(2)))
    .then((res) => {
      mongoose.disconnect().then(() => {
        process.exit(res.exitCode || (res.success ? EXIT_CODE.SUCCESS : EXIT_CODE.DISCREPANCIES_FOUND));
      });
    })
    .catch((err) => {
      console.error(`[Tax Reconciliation Fatal] ${err.message}`);
      process.exit(err instanceof MigrationGuardError ? EXIT_CODE.CLI_ERROR : EXIT_CODE.RUNTIME_ERROR);
    });
}

module.exports = {
  EXIT_CODE,
  isValidExactMoney,
  reconcileSingleTenant,
  auditCoupons,
  auditReturnsAndRefunds,
  auditPayments,
  runTaxReconciliation
};

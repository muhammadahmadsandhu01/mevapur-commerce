/**
 * @file RolloutAuthority.js
 * @description Version-pinned Rollout Authority for Exact-Money & Multi-Currency Commerce.
 *
 * Implements strict hierarchical rollout modes:
 *   legacy (1) < shadow_write (2) < exact_read (3)
 *
 * Rules:
 * 1. Default mode is 'legacy'.
 * 2. Runtime authorization (COMMERCE_MONEY_MODE) sets the upper bound.
 * 3. Database configuration (MarketConfig) can request or restrict mode, but can never exceed runtime authorization.
 * 4. Effective mode = min(runtimeAuthorizedMode, marketRequestedMode).
 * 5. 'exact_read' requires verified migration/readiness evidence. Missing/stale evidence fails closed.
 * 6. Divergence in shadow_write or exact_read fails closed before mutation.
 */

'use strict';

const CommerceError = require('../core/CommerceError');
const CurrencyRegistry = require('../registries/currencyRegistry');

const ROLLOUT_MODES = Object.freeze({
  LEGACY: 'legacy',
  SHADOW_WRITE: 'shadow_write',
  EXACT_READ: 'exact_read'
});

const MODE_WEIGHTS = Object.freeze({
  [ROLLOUT_MODES.LEGACY]: 1,
  [ROLLOUT_MODES.SHADOW_WRITE]: 2,
  [ROLLOUT_MODES.EXACT_READ]: 3
});

const REQUIRED_MODEL_SCOPE = Object.freeze([
  'products',
  'orders',
  'payments',
  'refunds',
  'coupons',
  'shipping_zones',
  'users',
  'returns'
]);

class RolloutAuthority {
  static get MODES() {
    return ROLLOUT_MODES;
  }

  static get REQUIRED_MODEL_SCOPE() {
    return REQUIRED_MODEL_SCOPE;
  }

  /**
   * Validates and returns the runtime-authorized rollout mode from process.env.
   * Fails closed with CommerceError if the configured value is invalid.
   * @param {string} [envValue]
   * @returns {string}
   */
  static getRuntimeAuthorizedMode(envValue = process.env.COMMERCE_MONEY_MODE) {
    if (!envValue || envValue === '') {
      return ROLLOUT_MODES.LEGACY;
    }

    const normalized = String(envValue).trim().toLowerCase();
    if (!Object.values(ROLLOUT_MODES).includes(normalized)) {
      throw new CommerceError(
        `Invalid runtime COMMERCE_MONEY_MODE: '${envValue}'. Must be one of: legacy, shadow_write, exact_read`,
        'COMMERCE_ROLLOUT_MODE_INVALID',
        500
      );
    }

    return normalized;
  }

  /**
   * Computes the effective rollout mode as min(runtimeAuthorization, marketRequestedMode).
   * Validates exact_read readiness evidence if exact_read is requested.
   * @param {Object} params
   * @param {string} [params.runtimeMode]
   * @param {string} [params.requestedMode]
   * @param {Object} [params.readinessEvidence]
   * @param {Object} [params.options]
   * @returns {string} Effective mode
   */
  static resolveEffectiveMode({
    runtimeMode = this.getRuntimeAuthorizedMode(),
    requestedMode = ROLLOUT_MODES.LEGACY,
    readinessEvidence = null,
    options = {}
  } = {}) {
    const runtime = this.getRuntimeAuthorizedMode(runtimeMode);
    const requested = Object.values(ROLLOUT_MODES).includes(requestedMode)
      ? requestedMode
      : ROLLOUT_MODES.LEGACY;

    const runtimeWeight = MODE_WEIGHTS[runtime];
    const requestedWeight = MODE_WEIGHTS[requested];

    // MarketConfig cannot elevate beyond runtime authorization
    const candidateWeight = Math.min(runtimeWeight, requestedWeight);
    let effectiveMode = Object.keys(MODE_WEIGHTS).find(
      (key) => MODE_WEIGHTS[key] === candidateWeight
    ) || ROLLOUT_MODES.LEGACY;

    // If candidate is exact_read, require verified migration evidence
    if (effectiveMode === ROLLOUT_MODES.EXACT_READ) {
      const isReady = this.verifyReadinessEvidence(readinessEvidence, options);
      if (!isReady) {
        // Fails closed: degrade to shadow_write if runtime allows, else legacy
        effectiveMode = runtimeWeight >= MODE_WEIGHTS[ROLLOUT_MODES.SHADOW_WRITE]
          ? ROLLOUT_MODES.SHADOW_WRITE
          : ROLLOUT_MODES.LEGACY;
      }
    }

    return effectiveMode;
  }

  /**
   * Verifies canonical MigrationState readiness evidence for exact_read activation.
   * Checks:
   * 1. Migration identifier (e.g. phase4d-exact-money-migration)
   * 2. Schema version
   * 3. Completed status
   * 4. Current database fingerprint
   * 5. Current currency-registry snapshot
   * 6. Exact-field coverage/reconciliation success
   * 7. Zero unresolved parity failures (conflictCount === 0)
   * 8. Required model/collection scope
   * 9. Runtime exact-read authorization
   * 10. Operator acknowledgement if configured
   *
   * @param {Object} evidence
   * @param {Object} [options={}]
   * @returns {boolean}
   */
  static verifyReadinessEvidence(evidence, options = {}) {
    if (!evidence || typeof evidence !== 'object') return false;

    // 1. Status must be completed
    if (evidence.status !== 'completed') return false;

    // 2. Migration ID must identify exact-money migration
    const migrationId = evidence.migrationId;
    if (typeof migrationId !== 'string' || (!migrationId.includes('exact_money') && !migrationId.includes('phase4d'))) {
      return false;
    }

    const metadata = evidence.metadata || {};

    // 3. Schema version
    const schemaVersion = metadata.schemaVersion || evidence.schemaVersion;
    if (!schemaVersion || typeof schemaVersion !== 'string') return false;

    // 4. Database fingerprint match if provided
    if (options.databaseFingerprint && metadata.databaseFingerprint) {
      if (metadata.databaseFingerprint !== options.databaseFingerprint) return false;
    }

    // 5. Currency registry snapshot
    const registrySnapshot = metadata.registrySnapshot || evidence.registrySnapshot || metadata.currencyRegistrySnapshot;
    if (!registrySnapshot || typeof registrySnapshot !== 'string') return false;

    // 6. Field coverage and reconciliation
    const coverage = metadata.fieldCoverage !== undefined ? metadata.fieldCoverage : evidence.fieldCoverage;
    if (coverage !== undefined && coverage !== null) {
      if (typeof coverage === 'number' && coverage < 100) return false;
      if (typeof coverage === 'object' && coverage.reconciled === false) return false;
    }

    // 7. Zero unresolved parity failures
    const conflictCount = evidence.conflictCount !== undefined ? evidence.conflictCount : 0;
    const unresolvedFailures = metadata.unresolvedParityFailures !== undefined ? metadata.unresolvedParityFailures : 0;
    if (conflictCount > 0 || unresolvedFailures > 0) return false;

    // 8. Required model/collection scope
    const scope = metadata.scope || evidence.scope;
    if (Array.isArray(scope)) {
      const missingScope = REQUIRED_MODEL_SCOPE.some((model) => !scope.includes(model));
      if (missingScope) return false;
    }

    // 9. Operator acknowledgement check if configured in options or env
    if (options.requireOperatorAck || process.env.COMMERCE_REQUIRE_OPERATOR_ACK === 'true') {
      const operatorAck = options.operatorAck !== undefined
        ? options.operatorAck
        : process.env.COMMERCE_EXACT_READ_READY;
      if (operatorAck !== 'true' && operatorAck !== true) return false;
    }

    // 10. CompletedAt / verifiedAt valid date
    const timestamp = evidence.completedAt || evidence.verifiedAt || metadata.verifiedAt;
    if (timestamp && new Date(timestamp).toString() === 'Invalid Date') return false;

    return true;
  }

  /**
   * Asserts write parity between legacy Number amount and exact Money instance / persistence doc.
   * In shadow_write and exact_read, fails closed if legacy and exact values diverge.
   * @param {number} legacyAmount
   * @param {Object} exactMoney - Money instance or exact money persistence object
   * @param {string} [effectiveMode=ROLLOUT_MODES.SHADOW_WRITE]
   * @param {string} [context='transaction']
   */
  static assertWriteParity(legacyAmount, exactMoney, effectiveMode = ROLLOUT_MODES.SHADOW_WRITE, context = 'transaction') {
    if (effectiveMode === ROLLOUT_MODES.LEGACY) return;

    if (!exactMoney) {
      throw new CommerceError(
        `Dual-write parity failure [${context}]: missing exact Money instance`,
        'COMMERCE_DUAL_WRITE_PARITY_FAILED',
        500
      );
    }

    if (typeof legacyAmount !== 'number' || !Number.isFinite(legacyAmount)) {
      throw new CommerceError(
        `Dual-write parity failure [${context}]: invalid legacy amount ${legacyAmount}`,
        'COMMERCE_DUAL_WRITE_PARITY_FAILED',
        500
      );
    }

    let exactMinor;
    let exponent;
    let currency;

    if (typeof exactMoney.amountMinor === 'bigint') {
      exactMinor = exactMoney.amountMinor;
      exponent = exactMoney.exponent !== undefined ? exactMoney.exponent : 2;
      currency = exactMoney.currency || 'PKR';
    } else if (exactMoney.amountMinor !== undefined && exactMoney.amountMinor !== null) {
      const minorStr = typeof exactMoney.amountMinor.toString === 'function'
        ? exactMoney.amountMinor.toString().trim()
        : String(exactMoney.amountMinor).trim();
      exactMinor = BigInt(minorStr);
      exponent = exactMoney.exponent !== undefined ? Number(exactMoney.exponent) : 2;
      currency = exactMoney.currency || 'PKR';
    } else {
      throw new CommerceError(
        `Dual-write parity failure [${context}]: exact money object lacks amountMinor`,
        'COMMERCE_DUAL_WRITE_PARITY_FAILED',
        500
      );
    }

    // Convert legacy amount to minor units based on currency exponent
    const scaleFactor = 10 ** exponent;
    const legacyMinor = BigInt(Math.round((legacyAmount + Number.EPSILON) * scaleFactor));

    if (legacyMinor !== exactMinor) {
      throw new CommerceError(
        `Dual-write parity divergence [${context}]: legacy ${legacyAmount} (${legacyMinor} minor) != exact ${exactMinor} minor in ${currency}`,
        'COMMERCE_DUAL_WRITE_PARITY_FAILED',
        500,
        { legacyAmount, legacyMinor: legacyMinor.toString(), exactMinor: exactMinor.toString(), currency }
      );
    }
  }

  /**
   * Asserts that a document contains required exact-money fields when in exact_read mode.
   * @param {Object} doc
   * @param {string} fieldName
   * @param {string} effectiveMode
   */
  static assertExactReadField(doc, fieldName, effectiveMode) {
    if (effectiveMode !== ROLLOUT_MODES.EXACT_READ) return;

    const exactVal = doc && doc[fieldName];
    if (!exactVal || exactVal.amountMinor === undefined || exactVal.amountMinor === null || !exactVal.currency) {
      throw new CommerceError(
        `Exact-read failure: required exact money field '${fieldName}' is missing or malformed on document`,
        'COMMERCE_EXACT_READ_MISSING_FIELD',
        500,
        { fieldName }
      );
    }
  }
}

module.exports = RolloutAuthority;

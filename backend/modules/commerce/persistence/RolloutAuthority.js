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

class RolloutAuthority {
  static get MODES() {
    return ROLLOUT_MODES;
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
   * @returns {string} Effective mode
   */
  static resolveEffectiveMode({
    runtimeMode = this.getRuntimeAuthorizedMode(),
    requestedMode = ROLLOUT_MODES.LEGACY,
    readinessEvidence = null
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
      const isReady = this.verifyReadinessEvidence(readinessEvidence);
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
   * Verifies migration readiness evidence for exact_read activation.
   * @param {Object} evidence
   * @returns {boolean}
   */
  static verifyReadinessEvidence(evidence) {
    if (!evidence || typeof evidence !== 'object') return false;
    if (evidence.status !== 'completed') return false;
    if (typeof evidence.migrationId !== 'string' || !evidence.migrationId.includes('exact_money')) return false;
    if (!evidence.registrySnapshot || typeof evidence.registrySnapshot !== 'string') return false;
    if (evidence.verifiedAt && new Date(evidence.verifiedAt).toString() === 'Invalid Date') return false;
    return true;
  }

  /**
   * Asserts write parity between legacy Number amount and exact Money instance.
   * In shadow_write and exact_read, fails closed if legacy and exact values diverge.
   * @param {number} legacyAmount
   * @param {Object} exactMoney
   * @param {string} effectiveMode
   * @param {string} [context='transaction']
   */
  static assertWriteParity(legacyAmount, exactMoney, effectiveMode, context = 'transaction') {
    if (effectiveMode === ROLLOUT_MODES.LEGACY) return;

    if (!exactMoney || typeof exactMoney.amountMinor !== 'bigint') {
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

    // Convert legacy amount to minor units based on currency exponent
    const scaleFactor = 10 ** exactMoney.exponent;
    const legacyMinor = BigInt(Math.round((legacyAmount + Number.EPSILON) * scaleFactor));

    if (legacyMinor !== exactMoney.amountMinor) {
      throw new CommerceError(
        `Dual-write parity divergence [${context}]: legacy ${legacyAmount} (${legacyMinor} minor) != exact ${exactMoney.amountMinor} minor in ${exactMoney.currency}`,
        'COMMERCE_DUAL_WRITE_PARITY_FAILED',
        500,
        { legacyAmount, legacyMinor: legacyMinor.toString(), exactMinor: exactMoney.amountMinor.toString(), currency: exactMoney.currency }
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
    if (!exactVal || !exactVal.amountMinor || !exactVal.currency) {
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

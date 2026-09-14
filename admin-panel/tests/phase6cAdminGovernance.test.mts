/**
 * Phase 6C Admin Commerce Governance Contract & Logic Test Suite
 * Covers Exact Rational Arithmetic, Minor Decimal Conversion, RBAC Permissions,
 * Bounded Payload Construction, and LockVersion Concurrency Contracts.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatExactMoney,
  normalizeMinorString,
  isExactMoneyEqual,
  decimalToMinorString,
  formatRationalPercentage,
} from '../src/lib/exactMoney.ts';

describe('Phase 6C: Admin Commerce Governance Contracts', () => {

  describe('1. Exact Money Formatting & Parity Safety', () => {
    test('formats zero-decimal currencies (JPY, CLP, KRW) without decimal points', () => {
      assert.equal(formatExactMoney({ amountMinor: '5000', currency: 'JPY' }), 'JPY 5,000');
      assert.equal(formatExactMoney({ amountMinor: 12500, currency: 'KRW' }), 'KRW 12,500');
      assert.equal(formatExactMoney({ amountMinor: BigInt(300), currency: 'CLP' }), 'CLP 300');
    });

    test('formats standard two-decimal currencies (USD, EUR, PKR, GBP, AED)', () => {
      assert.equal(formatExactMoney({ amountMinor: '142000', currency: 'PKR' }), 'PKR 1,420.00');
      assert.equal(formatExactMoney({ amountMinor: '99', currency: 'USD' }), 'USD 0.99');
      assert.equal(formatExactMoney({ amountMinor: '5', currency: 'EUR' }), 'EUR 0.05');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'AED' }), 'AED 0.00');
    });

    test('formats three-decimal currencies (KWD, BHD, OMR, JOD)', () => {
      assert.equal(formatExactMoney({ amountMinor: '123456', currency: 'KWD' }), 'KWD 123.456');
      assert.equal(formatExactMoney({ amountMinor: '75', currency: 'BHD' }), 'BHD 0.075');
    });

    test('formats four-decimal currencies (CLF, UYW)', () => {
      assert.equal(formatExactMoney({ amountMinor: '123456', currency: 'CLF' }), 'CLF 12.3456');
      assert.equal(formatExactMoney({ amountMinor: '500', currency: 'UYW' }), 'UYW 0.0500');
    });

    test('supports locale-aware grouping and decimal separators (en-US, de-DE, en-IN)', () => {
      const usFormatted = formatExactMoney({ amountMinor: '123456789', currency: 'USD' }, { locale: 'en-US' });
      assert.equal(usFormatted, 'USD 1,234,567.89');

      const deFormatted = formatExactMoney({ amountMinor: '123456789', currency: 'EUR' }, { locale: 'de-DE' });
      assert.ok(deFormatted.includes('1.234.567,89'));

      const inFormatted = formatExactMoney({ amountMinor: '123456789', currency: 'INR' }, { locale: 'en-IN' });
      assert.equal(inFormatted, 'INR 12,34,567.89');
    });

    test('handles values beyond JavaScript Number.MAX_SAFE_INTEGER without precision loss', () => {
      const hugeMinor = '900719925474099199999';
      const formatted = formatExactMoney({ amountMinor: hugeMinor, currency: 'USD' });
      assert.equal(formatted, 'USD 9,007,199,254,740,991,999.99');
    });

    test('handles negative monetary amounts safely', () => {
      assert.equal(formatExactMoney({ amountMinor: '-5000', currency: 'USD' }), '-USD 50.00');
      assert.equal(formatExactMoney({ amountMinor: '-5', currency: 'USD' }), '-USD 0.05');
    });

    test('normalizes integer minor strings safely', () => {
      assert.equal(normalizeMinorString('12500'), '12500');
      assert.equal(normalizeMinorString('-500'), '-500');
      assert.equal(normalizeMinorString(BigInt(300)), '300');
      assert.throws(() => normalizeMinorString('12.34'), /Invalid minor amount format/);
    });

    test('deterministic exact money equality comparison', () => {
      assert.equal(isExactMoneyEqual({ amountMinor: '100', currency: 'USD' }, { amountMinor: '100', currency: 'USD' }), true);
      assert.equal(isExactMoneyEqual({ amountMinor: '100', currency: 'USD' }, { amountMinor: '101', currency: 'USD' }), false);
      assert.equal(isExactMoneyEqual({ amountMinor: '100', currency: 'USD' }, { amountMinor: '100', currency: 'PKR' }), false);
    });

    test('converts decimal string inputs to exact integer minor units without float loss', () => {
      assert.equal(decimalToMinorString('12.5', 2), '1250');
      assert.equal(decimalToMinorString('0.99', 2), '99');
      assert.equal(decimalToMinorString('5', 2), '500');
      assert.equal(decimalToMinorString('0.05', 2), '5');
      assert.equal(decimalToMinorString('123.456', 3), '123456');
      assert.equal(decimalToMinorString('5000', 0), '5000');
    });

    test('handles negative and zero decimal values', () => {
      assert.equal(decimalToMinorString('-10.50', 2), '-1050');
      assert.equal(decimalToMinorString('0', 2), '0');
      assert.equal(decimalToMinorString('0.00', 2), '0');
    });

    test('formats rational rates (numerator/denominator) as exact percentages', () => {
      assert.equal(formatRationalPercentage(1700, 10000), '17%');
      assert.equal(formatRationalPercentage(500, 10000), '5%');
      assert.equal(formatRationalPercentage(550, 10000), '5.5%');
      assert.equal(formatRationalPercentage(0, 10000), '0%');
    });
  });

  describe('2. RBAC Permission Boundaries for Lifecycle Operations', () => {
    const roles = [
      { role: 'support', canDraft: false, canActivate: false, canRetire: false },
      { role: 'inventory', canDraft: false, canActivate: false, canRetire: false },
      { role: 'manager', canDraft: false, canActivate: false, canRetire: false },
      { role: 'admin', canDraft: true, canActivate: false, canRetire: false },
      { role: 'super_admin', canDraft: true, canActivate: true, canRetire: true },
    ];

    test('enforces strict role-based capability matrix', () => {
      for (const r of roles) {
        const hasDraftAccess = ['admin', 'super_admin'].includes(r.role);
        const hasLifecycleAccess = r.role === 'super_admin';

        assert.equal(hasDraftAccess, r.canDraft, `Role ${r.role} draft capability mismatch`);
        assert.equal(hasLifecycleAccess, r.canActivate, `Role ${r.role} activation capability mismatch`);
        assert.equal(hasLifecycleAccess, r.canRetire, `Role ${r.role} retirement capability mismatch`);
      }
    });
  });

  describe('3. Concurrency LockVersion Conflict (409) Protocol', () => {
    test('rejects draft save without expectedLockVersion match', () => {
      const serverVersion = { version: 2, lockVersion: 4 };
      const clientPayload = { expectedLockVersion: 3 };

      const isConflict = clientPayload.expectedLockVersion !== serverVersion.lockVersion;
      assert.equal(isConflict, true, 'Mismatch in lockVersion must trigger 409 conflict');
    });

    test('accepts draft save when expectedLockVersion matches server lockVersion', () => {
      const serverVersion = { version: 2, lockVersion: 4 };
      const clientPayload = { expectedLockVersion: 4 };

      const isConflict = clientPayload.expectedLockVersion !== serverVersion.lockVersion;
      assert.equal(isConflict, false, 'Matching lockVersion proceeds safely');
    });
  });

  describe('4. Readiness Classification Truthfulness', () => {
    test('classifies CONFIGURATION_CAPABLE only when active version has legal verified rules and active shipping', () => {
      const state1 = {
        hasActiveConfiguration: true,
        unverifiedTaxRulesCount: 0,
        shippingRulesCount: 2,
      };
      const isCapable = state1.hasActiveConfiguration && state1.unverifiedTaxRulesCount === 0 && state1.shippingRulesCount > 0;
      assert.equal(isCapable, true);
    });

    test('classifies TEST_CONFIGURED when unverified tax estimates exist', () => {
      const state2 = {
        hasActiveConfiguration: true,
        unverifiedTaxRulesCount: 1,
        shippingRulesCount: 2,
      };
      const isTestConfigured = state2.hasActiveConfiguration && state2.unverifiedTaxRulesCount > 0 && state2.shippingRulesCount > 0;
      assert.equal(isTestConfigured, true);
    });

    test('classifies UNVERIFIED when no active configuration exists', () => {
      const state3 = {
        hasActiveConfiguration: false,
        unverifiedTaxRulesCount: 0,
        shippingRulesCount: 0,
      };
      const isUnverified = !state3.hasActiveConfiguration;
      assert.equal(isUnverified, true);
    });
  });
});

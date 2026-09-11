'use strict';

const { RolloutAuthority, Money, CommerceError } = require('../../../modules/commerce');

describe('RolloutAuthority — Hierarchical Mode & Readiness Verification Unit Tests', () => {
  describe('Runtime Mode Validation', () => {
    it('defaults to legacy when COMMERCE_MONEY_MODE is unset or empty', () => {
      expect(RolloutAuthority.getRuntimeAuthorizedMode('')).toBe(RolloutAuthority.MODES.LEGACY);
      expect(RolloutAuthority.getRuntimeAuthorizedMode(undefined)).toBe(RolloutAuthority.MODES.LEGACY);
    });

    it('accepts valid modes case-insensitively', () => {
      expect(RolloutAuthority.getRuntimeAuthorizedMode('legacy')).toBe(RolloutAuthority.MODES.LEGACY);
      expect(RolloutAuthority.getRuntimeAuthorizedMode('SHADOW_WRITE')).toBe(RolloutAuthority.MODES.SHADOW_WRITE);
      expect(RolloutAuthority.getRuntimeAuthorizedMode('Exact_Read')).toBe(RolloutAuthority.MODES.EXACT_READ);
    });

    it('fails closed on unknown or invalid runtime mode during startup', () => {
      expect(() => RolloutAuthority.getRuntimeAuthorizedMode('unknown_mode')).toThrow(CommerceError);
      expect(() => RolloutAuthority.getRuntimeAuthorizedMode('unknown_mode')).toThrow(/Invalid runtime COMMERCE_MONEY_MODE/);
      expect(() => RolloutAuthority.getRuntimeAuthorizedMode('true')).toThrow(CommerceError);
    });
  });

  describe('Effective Mode Resolution (min(runtime, marketConfig))', () => {
    it('marketConfig cannot elevate beyond runtime authorization', () => {
      // Runtime is legacy, MarketConfig requests shadow_write -> Effective must be legacy
      const mode1 = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'legacy',
        requestedMode: 'shadow_write'
      });
      expect(mode1).toBe(RolloutAuthority.MODES.LEGACY);

      // Runtime is legacy, MarketConfig requests exact_read -> Effective must be legacy
      const mode2 = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'legacy',
        requestedMode: 'exact_read'
      });
      expect(mode2).toBe(RolloutAuthority.MODES.LEGACY);

      // Runtime is shadow_write, MarketConfig requests exact_read -> Effective must be shadow_write
      const mode3 = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'shadow_write',
        requestedMode: 'exact_read'
      });
      expect(mode3).toBe(RolloutAuthority.MODES.SHADOW_WRITE);
    });

    it('marketConfig can restrict mode below runtime authorization', () => {
      // Runtime is exact_read, MarketConfig requests legacy -> Effective is legacy
      const mode1 = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'exact_read',
        requestedMode: 'legacy'
      });
      expect(mode1).toBe(RolloutAuthority.MODES.LEGACY);

      // Runtime is exact_read, MarketConfig requests shadow_write -> Effective is shadow_write
      const mode2 = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'exact_read',
        requestedMode: 'shadow_write'
      });
      expect(mode2).toBe(RolloutAuthority.MODES.SHADOW_WRITE);
    });

    it('exact_read requires both runtime authorization and verified readiness evidence', () => {
      // Runtime authorized, market requested, but no evidence -> falls back to shadow_write
      const modeNoEvidence = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'exact_read',
        requestedMode: 'exact_read',
        readinessEvidence: null
      });
      expect(modeNoEvidence).toBe(RolloutAuthority.MODES.SHADOW_WRITE);

      // Incomplete evidence -> falls back to shadow_write
      const modeBadEvidence = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'exact_read',
        requestedMode: 'exact_read',
        readinessEvidence: { status: 'running' }
      });
      expect(modeBadEvidence).toBe(RolloutAuthority.MODES.SHADOW_WRITE);

      // Valid evidence -> activates exact_read
      const validEvidence = {
        migrationId: 'phase4d_exact_money_migration_v1',
        status: 'completed',
        registrySnapshot: 'MevaPur currency snapshot 2026-09',
        verifiedAt: new Date().toISOString()
      };
      const modeActive = RolloutAuthority.resolveEffectiveMode({
        runtimeMode: 'exact_read',
        requestedMode: 'exact_read',
        readinessEvidence: validEvidence
      });
      expect(modeActive).toBe(RolloutAuthority.MODES.EXACT_READ);
    });
  });

  describe('Write Parity & Divergence Enforcement', () => {
    it('passes parity check when legacy Number and exact Money agree', () => {
      const money = Money.fromDecimal('150.50', 'PKR'); // 15050 minor
      expect(() => {
        RolloutAuthority.assertWriteParity(150.5, money, RolloutAuthority.MODES.SHADOW_WRITE, 'order_subtotal');
      }).not.toThrow();
    });

    it('fails closed before mutation when legacy Number and exact Money diverge', () => {
      const money = Money.fromDecimal('150.50', 'PKR'); // 15050 minor
      expect(() => {
        RolloutAuthority.assertWriteParity(150.0, money, RolloutAuthority.MODES.SHADOW_WRITE, 'order_subtotal');
      }).toThrow(CommerceError);
      expect(() => {
        RolloutAuthority.assertWriteParity(150.0, money, RolloutAuthority.MODES.SHADOW_WRITE, 'order_subtotal');
      }).toThrow(/Dual-write parity divergence/);
    });

    it('skips parity assertions in legacy mode', () => {
      const money = Money.fromDecimal('150.50', 'PKR');
      expect(() => {
        RolloutAuthority.assertWriteParity(100.0, money, RolloutAuthority.MODES.LEGACY, 'order_subtotal');
      }).not.toThrow();
    });
  });

  describe('Exact Read Field Assertions', () => {
    it('passes when required exact field exists with valid snapshot', () => {
      const doc = {
        totalAmount: 150.50,
        totalAmountExact: {
          amountMinor: '15050',
          currency: 'PKR',
          exponent: 2
        }
      };
      expect(() => {
        RolloutAuthority.assertExactReadField(doc, 'totalAmountExact', RolloutAuthority.MODES.EXACT_READ);
      }).not.toThrow();
    });

    it('fails closed in exact_read mode when required exact field is missing', () => {
      const doc = { totalAmount: 150.50 };
      expect(() => {
        RolloutAuthority.assertExactReadField(doc, 'totalAmountExact', RolloutAuthority.MODES.EXACT_READ);
      }).toThrow(CommerceError);
      expect(() => {
        RolloutAuthority.assertExactReadField(doc, 'totalAmountExact', RolloutAuthority.MODES.EXACT_READ);
      }).toThrow(/required exact money field 'totalAmountExact' is missing/);
    });
  });
});

const {
  hasOwnPath,
  getPath,
  assertNoForbiddenKeys,
  buildSettingsUpdate,
  containsProviderCredentialInput,
  getUpdatedGroups,
  FORBIDDEN_KEYS,
  ALLOWED_SETTING_PATHS
} = require('../../../services/SettingSecurityService');
const { AppError } = require('../../../common/errors/AppError');

describe('SettingSecurityService Prototype Pollution Defense Unit Tests', () => {
  describe('Forbidden Keys Definition', () => {
    it('defines __proto__, constructor, and prototype as forbidden', () => {
      expect(FORBIDDEN_KEYS.has('__proto__')).toBe(true);
      expect(FORBIDDEN_KEYS.has('constructor')).toBe(true);
      expect(FORBIDDEN_KEYS.has('prototype')).toBe(true);
    });
  });

  describe('hasOwnPath Property Traversal Defenses', () => {
    it('allows valid property paths on plain objects', () => {
      const source = { store: { store_name: 'Harzaar' } };
      expect(hasOwnPath(source, 'store.store_name')).toBe(true);
      expect(hasOwnPath(source, 'store.store_email')).toBe(false);
    });

    it('rejects and aborts traversal on __proto__ path segment', () => {
      const source = { store: { store_name: 'Harzaar' } };
      expect(() => hasOwnPath(source, '__proto__.polluted')).toThrow(AppError);
      expect(() => hasOwnPath(source, 'store.__proto__.polluted')).toThrow('Forbidden property access: __proto__');

      try {
        hasOwnPath(source, '__proto__.polluted');
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('SECURITY_ERROR');
      }
    });

    it('rejects and aborts traversal on constructor path segment', () => {
      const source = { store: { store_name: 'Harzaar' } };
      expect(() => hasOwnPath(source, 'constructor.prototype.polluted')).toThrow(AppError);
      expect(() => hasOwnPath(source, 'constructor.prototype.polluted')).toThrow('Forbidden property access: constructor');
    });

    it('rejects and aborts traversal on prototype path segment', () => {
      const source = { store: { store_name: 'Harzaar' } };
      expect(() => hasOwnPath(source, 'store.prototype.polluted')).toThrow(AppError);
      expect(() => hasOwnPath(source, 'store.prototype.polluted')).toThrow('Forbidden property access: prototype');
    });
  });

  describe('getPath Traversal Defenses', () => {
    it('resolves valid nested property values', () => {
      const source = { store: { store_name: 'Harzaar Global' } };
      expect(getPath(source, 'store.store_name')).toBe('Harzaar Global');
      expect(getPath(source, 'store.nonexistent')).toBeUndefined();
    });

    it('rejects and aborts getPath traversal on __proto__ segment', () => {
      const source = { store: { store_name: 'Harzaar' } };
      expect(() => getPath(source, '__proto__.polluted')).toThrow(AppError);
      expect(() => getPath(source, 'store.__proto__.polluted')).toThrow('Forbidden property access: __proto__');
    });

    it('rejects and aborts getPath traversal on constructor and prototype segments', () => {
      const source = { store: { store_name: 'Harzaar' } };
      expect(() => getPath(source, 'constructor.name')).toThrow('Forbidden property access: constructor');
      expect(() => getPath(source, 'store.prototype.foo')).toThrow('Forbidden property access: prototype');
    });
  });

  describe('assertNoForbiddenKeys Object Inspection', () => {
    it('passes for safe setting objects', () => {
      expect(() => assertNoForbiddenKeys({
        store: { store_name: 'Harzaar' },
        tax: { tax_enabled: true }
      })).not.toThrow();
    });

    it('detects and blocks root-level prototype pollution payload', () => {
      const attack = JSON.parse('{"__proto__": {"polluted": true}}');
      expect(() => assertNoForbiddenKeys(attack)).toThrow(AppError);
      expect(() => assertNoForbiddenKeys(attack)).toThrow('Forbidden property access: __proto__');
    });

    it('detects and blocks nested prototype pollution payload', () => {
      const attack = JSON.parse('{"store": {"__proto__": {"isAdmin": true}}}');
      expect(() => assertNoForbiddenKeys(attack)).toThrow(AppError);
      expect(() => assertNoForbiddenKeys(attack)).toThrow('Forbidden property access: __proto__');
    });

    it('detects and blocks constructor poisoning payload', () => {
      const attack = JSON.parse('{"constructor": {"prototype": {"isAdmin": true}}}');
      expect(() => assertNoForbiddenKeys(attack)).toThrow(AppError);
      expect(() => assertNoForbiddenKeys(attack)).toThrow('Forbidden property access: constructor');
    });
  });

  describe('Settings API Functions Defense-in-Depth', () => {
    it('buildSettingsUpdate blocks prototype pollution payloads cleanly', () => {
      const attack = JSON.parse('{"__proto__": {"admin": true}}');
      expect(() => buildSettingsUpdate(attack)).toThrow(AppError);
      expect(() => buildSettingsUpdate(attack)).toThrow('Forbidden property access: __proto__');
    });

    it('buildSettingsUpdate preserves legitimate settings and extracts allowed fields only', () => {
      const safeData = {
        store: {
          store_name: 'MevaPur Supermarket',
          ignored_field: 'should_not_be_included'
        },
        shipping: {
          shipping_flat_rate: 150
        }
      };

      const result = buildSettingsUpdate(safeData);
      expect(result).toEqual({
        'store.store_name': 'MevaPur Supermarket',
        'shipping.shipping_flat_rate': 150
      });
      expect(result).not.toHaveProperty('store.ignored_field');
    });

    it('containsProviderCredentialInput blocks prototype pollution payloads', () => {
      const attack = JSON.parse('{"constructor": {"prototype": {"exploit": true}}}');
      expect(() => containsProviderCredentialInput(attack)).toThrow(AppError);
    });

    it('getUpdatedGroups blocks prototype pollution payloads', () => {
      const attack = JSON.parse('{"__proto__": {"admin": true}}');
      expect(() => getUpdatedGroups(attack)).toThrow(AppError);
    });

    it('getUpdatedGroups accurately returns updated group names for legitimate payloads', () => {
      const safeData = {
        store: { store_name: 'New Name' },
        tax: { tax_rate: 15 }
      };
      expect(getUpdatedGroups(safeData)).toEqual(['store', 'tax']);
    });
  });
});

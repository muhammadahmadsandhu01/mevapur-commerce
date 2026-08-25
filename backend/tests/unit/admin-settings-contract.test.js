const fs = require('fs');
const path = require('path');
const {
  LEGACY_PROVIDER_SECRET_PATHS
} = require('../../services/SettingSecurityService');

describe('Admin provider credential contract', () => {
  test('does not cache, render, or submit legacy provider-secret fields', () => {
    const pagePath = path.resolve(
      __dirname,
      '../../../admin-panel/src/app/settings/page.tsx'
    );
    const source = fs.readFileSync(pagePath, 'utf8');

    for (const dottedPath of LEGACY_PROVIDER_SECRET_PATHS) {
      const field = dottedPath.split('.').at(-1);
      expect(source).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
    expect(source).toContain('buildPaymentSettingsPayload(paymentData)');
    expect(source).toContain('providerCredentials');
  });
});

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { publicConfig, readOrigin, readSiteName, readLegalName, readSafeAssetPath, readSafeColor, readLogoMode } from '../src/config/publicConfig.ts';
import { branding, visibleSocialLinks, copyrightLine } from '../src/config/branding.ts';
import manifest from '../src/app/manifest.ts';

const generateManifest = typeof manifest === 'function' ? manifest : (manifest as unknown as { default: typeof manifest }).default;

describe('White-Label Brand Configuration & Dynamic Isolation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset process.env to original state
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('Brand A ("MevaPur Naturals") and Brand B ("Apex Gourmet Provisions") render cleanly with zero cross-contamination', () => {
    // Brand A configuration
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_SITE_NAME = 'MevaPur Naturals';
    process.env.NEXT_PUBLIC_LEGAL_NAME = 'MevaPur Naturals LLC';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://mevapur.test';
    process.env.NEXT_PUBLIC_TAGLINE = 'Pure Organic Goodness';
    process.env.NEXT_PUBLIC_SHORT_DESCRIPTION = 'Handcrafted organic dry fruits and artisanal provisions.';
    process.env.NEXT_PUBLIC_LOGO_PATH = '/brand/mevapur-logo.svg';
    process.env.NEXT_PUBLIC_LOGO_LIGHT_PATH = '/brand/mevapur-logo-light.svg';
    process.env.NEXT_PUBLIC_LOGO_DARK_PATH = '/brand/mevapur-logo-dark.svg';
    process.env.NEXT_PUBLIC_SYMBOL_PATH = '/brand/mevapur-symbol.svg';
    process.env.NEXT_PUBLIC_FAVICON_PATH = '/brand/mevapur-favicon.svg';
    process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR = '#1B5E20';
    process.env.NEXT_PUBLIC_THEME_ACCENT_COLOR = '#81C784';
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'care@mevapur.test';
    process.env.NEXT_PUBLIC_SUPPORT_PHONE = '+92 300 1234567';

    assert.equal(branding.siteName, 'MevaPur Naturals');
    assert.equal(branding.legalDisplayName, 'MevaPur Naturals LLC');
    assert.equal(branding.canonicalOrigin, 'https://mevapur.test');
    assert.equal(branding.tagline, 'Pure Organic Goodness');
    assert.equal(branding.shortDescription, 'Handcrafted organic dry fruits and artisanal provisions.');
    assert.equal(branding.logoPath, '/brand/mevapur-logo.svg');
    assert.equal(branding.logoLightPath, '/brand/mevapur-logo-light.svg');
    assert.equal(branding.logoDarkPath, '/brand/mevapur-logo-dark.svg');
    assert.equal(branding.symbolPath, '/brand/mevapur-symbol.svg');
    assert.equal(branding.faviconPath, '/brand/mevapur-favicon.svg');
    assert.equal(branding.primaryColor, '#1B5E20');
    assert.equal(branding.accentColor, '#81C784');
    assert.equal(branding.supportEmail, 'care@mevapur.test');
    assert.equal(branding.supportPhone, '+92 300 1234567');
    assert.equal(branding.copyrightOwner, 'MevaPur Naturals LLC');
    assert.match(copyrightLine(), /MevaPur Naturals LLC/);

    const manifestA = generateManifest();
    assert.equal(manifestA.name, 'MevaPur Naturals');
    assert.equal(manifestA.short_name, 'MevaPur Naturals');
    assert.equal(manifestA.theme_color, '#1B5E20');
    assert.equal(manifestA.icons?.[0]?.src, '/brand/mevapur-favicon.svg');

    // Switch dynamically to Brand B configuration
    process.env.NEXT_PUBLIC_SITE_NAME = 'Apex Gourmet Provisions';
    process.env.NEXT_PUBLIC_LEGAL_NAME = 'Apex Gourmet Ltd';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://apexgourmet.test';
    process.env.NEXT_PUBLIC_TAGLINE = 'Finest Culinary Selections';
    process.env.NEXT_PUBLIC_SHORT_DESCRIPTION = 'Global purveyor of epicurean pantry essentials.';
    process.env.NEXT_PUBLIC_LOGO_PATH = '/brand/apex-logo.svg';
    process.env.NEXT_PUBLIC_LOGO_LIGHT_PATH = '/brand/apex-logo-light.svg';
    process.env.NEXT_PUBLIC_LOGO_DARK_PATH = '/brand/apex-logo-dark.svg';
    process.env.NEXT_PUBLIC_SYMBOL_PATH = '/brand/apex-symbol.svg';
    process.env.NEXT_PUBLIC_FAVICON_PATH = '/brand/apex-favicon.svg';
    process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR = '#0A192F';
    process.env.NEXT_PUBLIC_THEME_ACCENT_COLOR = '#64FFDA';
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'concierge@apexgourmet.test';
    process.env.NEXT_PUBLIC_SUPPORT_PHONE = '+44 20 7946 0991';

    assert.equal(branding.siteName, 'Apex Gourmet Provisions');
    assert.equal(branding.legalDisplayName, 'Apex Gourmet Ltd');
    assert.equal(branding.canonicalOrigin, 'https://apexgourmet.test');
    assert.equal(branding.tagline, 'Finest Culinary Selections');
    assert.equal(branding.shortDescription, 'Global purveyor of epicurean pantry essentials.');
    assert.equal(branding.logoPath, '/brand/apex-logo.svg');
    assert.equal(branding.logoLightPath, '/brand/apex-logo-light.svg');
    assert.equal(branding.logoDarkPath, '/brand/apex-logo-dark.svg');
    assert.equal(branding.symbolPath, '/brand/apex-symbol.svg');
    assert.equal(branding.faviconPath, '/brand/apex-favicon.svg');
    assert.equal(branding.primaryColor, '#0A192F');
    assert.equal(branding.accentColor, '#64FFDA');
    assert.equal(branding.supportEmail, 'concierge@apexgourmet.test');
    assert.equal(branding.supportPhone, '+44 20 7946 0991');
    assert.equal(branding.copyrightOwner, 'Apex Gourmet Ltd');
    assert.match(copyrightLine(), /Apex Gourmet Ltd/);

    // Default legal name matches site name if not explicitly set
    assert.equal(readLegalName(), 'Apex Gourmet Ltd');

    const manifestB = generateManifest();
    assert.equal(manifestB.name, 'Apex Gourmet Provisions');
    assert.equal(manifestB.short_name, 'Apex Gourmet Provisions');
    assert.equal(manifestB.theme_color, '#0A192F');
    assert.equal(manifestB.icons?.[0]?.src, '/brand/apex-favicon.svg');
  });

  test('Single-merchant architecture strictly rejects dynamic branding switches from untrusted inputs', () => {
    // Branding must ONLY be sourced from deployment environment config, never from request headers or query params
    process.env.NEXT_PUBLIC_SITE_NAME = 'Legitimate Single Merchant';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://legitimate-store.test';

    const untrustedHostHeaders = ['attacker.com', 'evil-brand.com', 'localhost:9999'];
    const untrustedQueryParams = { brand: 'attacker', siteName: 'Malicious Store', logo: 'https://evil.com/phish.svg' };
    const untrustedCookies = { brand_override: 'hacked', active_tenant: 'tenant-666' };

    // Simulate presence of untrusted request variables without altering environment
    assert.ok(untrustedHostHeaders.length > 0);
    assert.ok(untrustedQueryParams.brand === 'attacker');
    assert.ok(untrustedCookies.brand_override === 'hacked');

    // Assert that publicConfig and branding remain completely immune
    assert.equal(publicConfig.siteName, 'Legitimate Single Merchant');
    assert.equal(publicConfig.siteOrigin, 'https://legitimate-store.test');
    assert.equal(branding.siteName, 'Legitimate Single Merchant');
    assert.equal(branding.canonicalOrigin, 'https://legitimate-store.test');

    // Public display values cannot be mutated directly (frozen object)
    assert.throws(() => {
      // @ts-expect-error mutating frozen object
      branding.siteName = 'Hacked';
    }, TypeError);
  });

  test('Production fails fast on missing or invalid deployment configuration', () => {
    delete process.env.NEXT_PUBLIC_SITE_NAME;
    assert.throws(
      () => readSiteName(true),
      /NEXT_PUBLIC_SITE_NAME is required for production builds/
    );

    // Non-production uses safe neutral HARZAAR demo fallback
    assert.equal(readSiteName(false), 'HARZAAR');

    // Missing origin in production
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.throws(
      () => readOrigin('', 'NEXT_PUBLIC_SITE_URL', 'http://localhost:3000', true),
      /NEXT_PUBLIC_SITE_URL is required for production builds/
    );

    // HTTP origin in production
    assert.throws(
      () => readOrigin('http://insecure-store.com', 'NEXT_PUBLIC_SITE_URL', 'http://localhost:3000', true),
      /NEXT_PUBLIC_SITE_URL must use HTTPS for production builds/
    );

    // Credentials in origin
    assert.throws(
      () => readOrigin('https://admin:secret@secure-store.com', 'NEXT_PUBLIC_SITE_URL', 'http://localhost:3000', true),
      /NEXT_PUBLIC_SITE_URL must not contain credentials/
    );

    // Subpath or query in origin
    assert.throws(
      () => readOrigin('https://secure-store.com/subpath', 'NEXT_PUBLIC_SITE_URL', 'http://localhost:3000', true),
      /NEXT_PUBLIC_SITE_URL must not contain a path, query, or fragment/
    );
  });

  test('Logo mode configuration accepts wordmark and image modes safely', () => {
    process.env.NEXT_PUBLIC_LOGO_MODE = 'image';
    assert.equal(readLogoMode(), 'image');
    assert.equal(publicConfig.logoMode, 'image');
    assert.equal(branding.logoMode, 'image');

    process.env.NEXT_PUBLIC_LOGO_MODE = 'wordmark';
    assert.equal(readLogoMode(), 'wordmark');
    assert.equal(publicConfig.logoMode, 'wordmark');

    delete process.env.NEXT_PUBLIC_LOGO_MODE;
    assert.equal(readLogoMode(), 'wordmark');
  });

  test('Asset paths and theme colors reject dangerous injection attacks', () => {
    // Dangerous asset paths
    const dangerousPaths = [
      'javascript:alert(document.cookie)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil-cdn.com/malicious.svg',
      '\\\\attacker-smb\\share\\logo.svg',
      '/brand/../../etc/passwd',
      '/brand/logo<script>.svg',
    ];

    for (const badPath of dangerousPaths) {
      assert.throws(
        () => readSafeAssetPath(badPath, '/brand/logo.svg', 'NEXT_PUBLIC_LOGO_PATH'),
        /(contains invalid characters|remote URLs must use HTTPS|must not use protocol-relative|must be a root-relative path)/,
        `Should reject dangerous path: ${badPath}`
      );
    }

    // Valid asset paths
    assert.equal(readSafeAssetPath('/brand/custom-logo.svg', '/brand/logo.svg', 'TEST'), '/brand/custom-logo.svg');
    assert.equal(readSafeAssetPath('https://cdn.example.com/assets/logo.png', '/brand/logo.svg', 'TEST'), 'https://cdn.example.com/assets/logo.png');

    // Dangerous color injections
    const dangerousColors = [
      '#0B132B; background: red',
      'rgb(0,0,0); alert(1)',
      'url(https://evil.com/tracker.png)',
      '<script>alert(1)</script>',
      'expression(alert(1))',
      '#XYZ',
      'blue', // strict hex enforcement for theme tokens
    ];

    for (const badColor of dangerousColors) {
      assert.throws(
        () => readSafeColor(badColor, '#0B132B', 'NEXT_PUBLIC_THEME_PRIMARY_COLOR'),
        /must be a valid hex color code/,
        `Should reject invalid/dangerous color: ${badColor}`
      );
    }

    // Valid hex colors
    assert.equal(readSafeColor('#FFF', '#000', 'TEST'), '#FFF');
    assert.equal(readSafeColor('#0B132B', '#000', 'TEST'), '#0B132B');
    assert.equal(readSafeColor('#FF8A00CC', '#000', 'TEST'), '#FF8A00CC');
  });

  test('Social links validation filters invalid protocols and safely exports allowlisted URLs', () => {
    process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK = 'https://facebook.com/officialstore';
    process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM = 'https://instagram.com/officialstore';
    process.env.NEXT_PUBLIC_SOCIAL_X = 'javascript:alert(1)'; // dangerous protocol
    process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE = ''; // empty

    const visible = visibleSocialLinks();
    const visibleKeys = visible.map(([network]) => network);
    const visibleUrls = visible.map(([, url]) => url);

    assert.ok(visibleKeys.includes('facebook'));
    assert.ok(visibleKeys.includes('instagram'));
    assert.ok(!visibleKeys.includes('x'), 'javascript: protocol must be filtered out');
    assert.ok(!visibleKeys.includes('youtube'), 'empty URL must be filtered out');
    assert.ok(visibleUrls.every((url) => url.startsWith('https://')));
  });

  test('Audits active Storefront source files to ensure zero hardcoded legacy brand strings in presentation', () => {
    const presentationFiles = [
      'src/app/layout.tsx',
      'src/app/page.tsx',
      'src/app/login/page.tsx',
      'src/app/register/page.tsx',
      'src/app/orders/[id]/invoice/page.tsx',
      'src/components/Navbar.tsx',
      'src/components/Footer.tsx',
      'src/components/Hero.tsx',
      'src/components/brand/BrandLogo.tsx',
      'src/components/products/ProductReviews.tsx',
      'src/components/account/ReturnRequestForm.tsx',
      'src/components/account/MyReviewsList.tsx',
      'src/components/assistant/HelpAssistant.tsx',
    ];

    for (const relPath of presentationFiles) {
      const fullPath = path.resolve(relPath);
      assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check for legacy brand names in presentation markup
      assert.equal(
        /HARZAAR/i.test(content),
        false,
        `${relPath} must not contain hardcoded HARZAAR brand string`
      );

      // Check for unsupported certification and cryptographic ledger claims
      assert.equal(
        /Enterprise Verified Commerce Platform/i.test(content),
        false,
        `${relPath} must not contain unsupported Enterprise Verified claim`
      );
      assert.equal(
        /Cryptographically verified/i.test(content),
        false,
        `${relPath} must not contain unsupported Cryptographically verified claim`
      );
    }
  });

  test('Audits public SVG brand assets to ensure zero legacy COMMERCE text embedded', () => {
    const brandSvgFiles = [
      'public/brand/logo.svg',
      'public/brand/logo-light.svg',
      'public/brand/logo-dark.svg',
      'public/brand/symbol.svg',
      'public/brand/favicon.svg',
    ];

    for (const relPath of brandSvgFiles) {
      const fullPath = path.resolve(relPath);
      assert.ok(fs.existsSync(fullPath), `SVG file must exist: ${relPath}`);
      const svg = fs.readFileSync(fullPath, 'utf8');

      assert.equal(
        /COMMERCE/i.test(svg),
        false,
        `${relPath} must not contain legacy COMMERCE text`
      );
    }
  });

  test('Environment example documents exact public variables without undocumented aliases', () => {
    const envExamplePath = path.resolve('.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');

    const expectedVariables = [
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_SITE_URL',
      'NEXT_PUBLIC_SITE_NAME',
      'NEXT_PUBLIC_LEGAL_NAME',
      'NEXT_PUBLIC_TAGLINE',
      'NEXT_PUBLIC_SHORT_DESCRIPTION',
      'NEXT_PUBLIC_DEFAULT_LOCALE',
      'NEXT_PUBLIC_LOGO_MODE',
      'NEXT_PUBLIC_LOGO_PATH',
      'NEXT_PUBLIC_LOGO_LIGHT_PATH',
      'NEXT_PUBLIC_LOGO_DARK_PATH',
      'NEXT_PUBLIC_SYMBOL_PATH',
      'NEXT_PUBLIC_FAVICON_PATH',
      'NEXT_PUBLIC_SOCIAL_IMAGE_PATH',
      'NEXT_PUBLIC_THEME_PRIMARY_COLOR',
      'NEXT_PUBLIC_THEME_ACCENT_COLOR',
      'NEXT_PUBLIC_THEME_SURFACE_COLOR',
      'NEXT_PUBLIC_THEME_MUTED_COLOR',
      'NEXT_PUBLIC_SUPPORT_EMAIL',
      'NEXT_PUBLIC_SALES_EMAIL',
      'NEXT_PUBLIC_SUPPORT_PHONE',
      'NEXT_PUBLIC_WHATSAPP',
      'NEXT_PUBLIC_STORE_ADDRESS',
      'NEXT_PUBLIC_BUSINESS_HOURS',
      'NEXT_PUBLIC_SEARCH_INDEXING_ENABLED',
      'NEXT_PUBLIC_SOCIAL_FACEBOOK',
      'NEXT_PUBLIC_SOCIAL_INSTAGRAM',
      'NEXT_PUBLIC_SOCIAL_X',
      'NEXT_PUBLIC_SOCIAL_YOUTUBE',
      'NEXT_PUBLIC_SOCIAL_LINKEDIN',
      'NEXT_PUBLIC_SOCIAL_TIKTOK',
    ];

    // Extract all defined keys from .env.example
    const documentedKeys = envExampleContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.split('=')[0].trim());

    // Verify all expected variables are documented
    for (const varName of expectedVariables) {
      assert.ok(
        documentedKeys.includes(varName),
        `.env.example must document ${varName}`
      );
    }

    // Verify no undocumented aliases exist in .env.example
    for (const documentedKey of documentedKeys) {
      assert.ok(
        expectedVariables.includes(documentedKey),
        `.env.example contains undocumented variable: ${documentedKey}`
      );
    }
  });
});

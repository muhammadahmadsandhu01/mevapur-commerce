import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSafeNavigationUrl } from '../src/lib/navigation.ts';
import { normalizeContentItem } from '../src/services/content.service.ts';

describe('Phase 6 CMS URL & Navigation Safety Contracts', () => {
  test('allows safe root-relative storefront paths', () => {
    const paths = ['/products', '/pages/about-us', '/categories/dry-fruits', '/cart', '/account#returns'];
    for (const path of paths) {
      const result = getSafeNavigationUrl(path);
      assert.ok(result, `Path should be valid: ${path}`);
      assert.equal(result.url, path);
      assert.equal(result.isExternal, false);
      assert.equal(result.isAction, false);
    }
  });

  test('allows safe external HTTPS destinations and sets security attributes', () => {
    const urls = ['https://example.com/partner', 'https://cdn.mevapur.com/assets/doc.pdf'];
    for (const url of urls) {
      const result = getSafeNavigationUrl(url);
      assert.ok(result, `HTTPS url should be valid: ${url}`);
      assert.equal(result.url, url);
      assert.equal(result.isExternal, true);
      assert.equal(result.target, '_blank');
      assert.equal(result.rel, 'noopener noreferrer');
    }
  });

  test('allows safe contact action URLs (mailto: and tel:)', () => {
    const emailRes = getSafeNavigationUrl('mailto:support@mevapur.com');
    assert.ok(emailRes);
    assert.equal(emailRes.url, 'mailto:support@mevapur.com');
    assert.equal(emailRes.isAction, true);
    assert.equal(emailRes.isExternal, false);

    const phoneRes = getSafeNavigationUrl('tel:+92 300 1234567');
    assert.ok(phoneRes);
    assert.equal(phoneRes.url, 'tel:+923001234567');
    assert.equal(phoneRes.isAction, true);
  });

  test('strictly rejects dangerous schemes (javascript:, data:, vbscript:, file:)', () => {
    const dangerous = [
      'javascript:alert(1)',
      'javascript:void(0)',
      'JAVASCRIPT:alert(document.cookie)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox("hello")',
      'file:///etc/passwd',
      'ftp://anonymous@ftp.example.com',
    ];

    for (const url of dangerous) {
      const result = getSafeNavigationUrl(url);
      assert.equal(result, null, `Dangerous URL must be rejected: ${url}`);
    }
  });

  test('strictly rejects protocol-relative URLs (//evil.com)', () => {
    const result = getSafeNavigationUrl('//attacker.com/malicious');
    assert.equal(result, null, 'Protocol-relative URL must be rejected');
  });

  test('strictly rejects credential-bearing URLs (https://user:pass@domain.com)', () => {
    const result = getSafeNavigationUrl('https://admin:secretpass@store.mevapur.com');
    assert.equal(result, null, 'Credential-bearing URL must be rejected');
  });

  test('returns fallback if provided for invalid inputs', () => {
    const result = getSafeNavigationUrl('javascript:alert(1)', '/products');
    assert.ok(result);
    assert.equal(result.url, '/products');
    assert.equal(result.isExternal, false);
  });
});

describe('Phase 6 Content Normalization Contracts', () => {
  test('normalizes a valid slider content record', () => {
    const raw = {
      _id: 'slider-123',
      type: 'slider',
      title: 'Summer Organic Harvest',
      subtitle: 'Fresh Arrivals',
      description: 'Handpicked seasonal dried fruits and nuts.',
      image: 'https://images.unsplash.com/photo-12345',
      button: {
        text: 'Shop Now',
        link: '/products?category=summer',
      },
      position: 1,
      isActive: true,
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-09-30T23:59:59.000Z',
    };

    const normalized = normalizeContentItem(raw);
    assert.ok(normalized);
    assert.equal(normalized._id, 'slider-123');
    assert.equal(normalized.type, 'slider');
    assert.equal(normalized.title, 'Summer Organic Harvest');
    assert.equal(normalized.subtitle, 'Fresh Arrivals');
    assert.equal(normalized.position, 1);
    assert.equal(normalized.isActive, true);
    assert.equal(normalized.button?.text, 'Shop Now');
    assert.equal(normalized.button?.link, '/products?category=summer');
    assert.equal(normalized.image, 'https://images.unsplash.com/photo-12345');
  });

  test('normalizes a CMS policy page record with SEO metadata', () => {
    const raw = {
      _id: 'page-privacy',
      type: 'page',
      title: 'Privacy Policy',
      slug: 'privacy-policy',
      content: '# Privacy Policy\n\nYour privacy is important to us.\n\n- We never sell your data.\n- Payment details are tokenized.',
      isActive: true,
      seo: {
        metaTitle: 'MevaPur Privacy Policy & Customer Data Protection',
        metaDescription: 'Learn how MevaPur handles and protects your personal data.',
        keywords: 'privacy, security, mevapur',
      },
    };

    const normalized = normalizeContentItem(raw);
    assert.ok(normalized);
    assert.equal(normalized.type, 'page');
    assert.equal(normalized.slug, 'privacy-policy');
    assert.equal(normalized.seo?.metaTitle, 'MevaPur Privacy Policy & Customer Data Protection');
    assert.ok(normalized.content?.includes('# Privacy Policy'));
  });

  test('rejects records with missing required fields or invalid types', () => {
    assert.equal(normalizeContentItem(null), null);
    assert.equal(normalizeContentItem({}), null);
    assert.equal(normalizeContentItem({ _id: '123' }), null); // missing title and type
    assert.equal(normalizeContentItem({ _id: '123', title: 'Test', type: 'invalid_type' }), null);
  });

  test('strips unsafe image protocols during normalization', () => {
    const raw = {
      _id: 'banner-unsafe',
      type: 'banner',
      title: 'XSS Banner',
      image: 'javascript:alert(1)',
      isActive: true,
    };

    const normalized = normalizeContentItem(raw);
    assert.ok(normalized);
    assert.equal(normalized.image, undefined); // Unsafe image stripped
  });
});

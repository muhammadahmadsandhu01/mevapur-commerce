/**
 * @file phase8-template-localization.unit.test.js
 * @description Unit tests for Phase 8 Message Template Engine, Variable Allowlists,
 * HTML/Script Injection Resistance, URL Safety, and Governed Localization Fallbacks.
 */

'use strict';

const messageTemplateEngine = require('../../services/notification/MessageTemplateEngine');

describe('Phase 8 — Template Governance & Localization Safety Unit Tests', () => {
  it('2.1 fails closed when required template variables are missing', () => {
    expect(() => {
      messageTemplateEngine.render('ORDER_CONFIRMATION_V1', {
        orderNumber: 'ORD-1234',
        // customerName is missing!
        total: '100.00',
        currency: 'USD'
      });
    }).toThrow('missing required variables: customerName');
  });

  it('2.2 escapes HTML injection attacks in rendered template bodies', () => {
    const maliciousPayload = {
      orderNumber: 'ORD-9999<script>alert("XSS")</script>',
      customerName: 'John <img src=x onerror=alert(1)> Doe',
      total: '250.00',
      currency: 'USD',
      viewOrderUrl: 'https://storefront.mevapur.test/orders/ORD-9999'
    };

    const rendered = messageTemplateEngine.render('ORDER_CONFIRMATION_V1', maliciousPayload);

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('2.3 rejects insecure URL schemes such as javascript: and data: URIs', () => {
    expect(() => {
      messageTemplateEngine.render('PAYMENT_ACTION_REQUIRED_V1', {
        orderNumber: 'ORD-1111',
        customerName: 'Security Tester',
        actionUrl: 'javascript:alert(document.cookie)'
      });
    }).toThrow('Insecure URL detected');

    expect(() => {
      messageTemplateEngine.render('PAYMENT_ACTION_REQUIRED_V1', {
        orderNumber: 'ORD-1111',
        customerName: 'Security Tester',
        actionUrl: 'data:text/html,<script>alert(1)</script>'
      });
    }).toThrow('Insecure URL detected');
  });

  it('2.4 accepts safe HTTPS and relative URLs', () => {
    const renderedHttps = messageTemplateEngine.render('PAYMENT_FAILED_V1', {
      orderNumber: 'ORD-2222',
      customerName: 'User',
      reason: 'Insufficient funds',
      retryUrl: 'https://storefront.mevapur.test/checkout?retry=ORD-2222'
    });
    expect(renderedHttps.html).toContain('href="https://storefront.mevapur.test/checkout?retry=ORD-2222"');

    const renderedRelative = messageTemplateEngine.render('PAYMENT_FAILED_V1', {
      orderNumber: 'ORD-2222',
      customerName: 'User',
      reason: 'Insufficient funds',
      retryUrl: '/payment-instructions?order=ORD-2222'
    });
    expect(renderedRelative.html).toContain('href="/payment-instructions?order=ORD-2222"');
  });

  it('2.5 resolves supported locales and defaults safely on unsupported locales', () => {
    expect(messageTemplateEngine.resolveLocale('en-PK')).toBe('en-PK');
    expect(messageTemplateEngine.resolveLocale('en-US')).toBe('en-US');
    expect(messageTemplateEngine.resolveLocale('en')).toBe('en');
    expect(messageTemplateEngine.resolveLocale('fr-FR')).toBe('en-US');
    expect(messageTemplateEngine.resolveLocale(null)).toBe('en-US');
  });

  it('2.6 formats money and dates deterministically', () => {
    expect(messageTemplateEngine.formatMoney(1500.5, 'PKR')).toBe('1500.50');
    expect(messageTemplateEngine.formatMoney('250.00', 'USD')).toBe('250.00');

    const fixedDate = new Date('2026-09-20T12:00:00Z');
    const formatted = messageTemplateEngine.formatDate(fixedDate, 'en-US');
    expect(formatted).toContain('2026');
    expect(formatted).toContain('Sep');
  });
});

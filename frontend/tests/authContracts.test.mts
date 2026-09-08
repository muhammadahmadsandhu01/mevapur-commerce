import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isPublicRoute,
  isProtectedRoute,
  isSafeLocalRedirect,
  normalizePathname,
} from '../src/lib/routeClassification.ts';

describe('Storefront Route Classification & Navigation Safety', () => {
  test('correctly normalizes paths with query strings, hashes, and trailing slashes', () => {
    assert.equal(normalizePathname('/products?sort=price'), '/products');
    assert.equal(normalizePathname('/products/#reviews'), '/products');
    assert.equal(normalizePathname('/account/'), '/account');
    assert.equal(normalizePathname(''), '/');
    assert.equal(normalizePathname('/'), '/');
  });

  test('classifies public Storefront routes correctly', () => {
    assert.equal(isPublicRoute('/'), true);
    assert.equal(isPublicRoute('/login'), true);
    assert.equal(isPublicRoute('/register'), true);
    assert.equal(isPublicRoute('/forgot-password'), true);
    assert.equal(isPublicRoute('/reset-password'), true);
    assert.equal(isPublicRoute('/reset-password?token=abc'), true);
    assert.equal(isPublicRoute('/products'), true);
    assert.equal(isPublicRoute('/products/almonds-1kg'), true);
    assert.equal(isPublicRoute('/search'), true);
    assert.equal(isPublicRoute('/cart'), true);
    assert.equal(isPublicRoute('/checkout'), true);
    assert.equal(isPublicRoute('/healthz'), true);
    assert.equal(isPublicRoute('/robots.txt'), true);
    assert.equal(isPublicRoute('/sitemap.xml'), true);
  });

  test('classifies customer protected routes correctly', () => {
    assert.equal(isProtectedRoute('/account'), true);
    assert.equal(isProtectedRoute('/account/profile'), true);
    assert.equal(isProtectedRoute('/orders'), true);
    assert.equal(isProtectedRoute('/orders/123'), true);
    assert.equal(isProtectedRoute('/orders/123/invoice'), true);
    assert.equal(isProtectedRoute('/wishlist'), true);

    // Public routes must not be classified as protected
    assert.equal(isProtectedRoute('/login'), false);
    assert.equal(isProtectedRoute('/products'), false);
    assert.equal(isProtectedRoute('/'), false);
  });

  test('prevents open-redirect vulnerabilities strictly', () => {
    // Valid local routes
    assert.equal(isSafeLocalRedirect('/account'), '/account');
    assert.equal(isSafeLocalRedirect('/orders/123'), '/orders/123');
    assert.equal(isSafeLocalRedirect('/cart'), '/cart');

    // Malicious open redirect payloads must fall back to '/'
    assert.equal(isSafeLocalRedirect('https://evil.com'), '/');
    assert.equal(isSafeLocalRedirect('http://attacker.com/steal'), '/');
    assert.equal(isSafeLocalRedirect('//evil.com'), '/');
    assert.equal(isSafeLocalRedirect('/\\evil.com'), '/');
    assert.equal(isSafeLocalRedirect('\\evil.com'), '/');
    assert.equal(isSafeLocalRedirect('javascript:alert(1)'), '/');
    assert.equal(isSafeLocalRedirect(null), '/');
    assert.equal(isSafeLocalRedirect(undefined), '/');
    assert.equal(isSafeLocalRedirect('', '/login'), '/login');
  });
});

describe('Storefront Source Inventory & White-Label Isolation', () => {
  test('proves absence of Admin-only client and guard files in Storefront source', () => {
    const adminApiPath = path.resolve('src/lib/adminApi.ts');
    const adminGuardPath = path.resolve('src/components/admin/AdminGuard.tsx');
    const adminDir = path.resolve('src/components/admin');

    assert.equal(fs.existsSync(adminApiPath), false, 'adminApi.ts must not exist in Storefront source');
    assert.equal(fs.existsSync(adminGuardPath), false, 'AdminGuard.tsx must not exist in Storefront source');
    assert.equal(fs.existsSync(adminDir), false, 'src/components/admin directory must not exist');
  });

  test('proves absence of tracked backup page files in route tree', () => {
    const backupFile = path.resolve('src/app/checkout/backup.tsx');
    assert.equal(fs.existsSync(backupFile), false, 'checkout/backup.tsx must not exist in route tree');
  });

  test('verifies absence of hardcoded HARZAAR branding in active Storefront presentation source', () => {
    const filesToAudit = [
      'src/app/orders/[id]/invoice/page.tsx',
      'src/components/account/ReturnRequestForm.tsx',
      'src/components/products/ProductReviews.tsx',
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.resolve(relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.equal(
          /HARZAAR/i.test(content),
          false,
          `${relPath} must not contain hardcoded HARZAAR brand strings`
        );
      }
    }
  });
});

describe('Password Policy Enterprise Verification', () => {
  const validatePolicy = (pwd: string) => {
    const hasLength = pwd.length >= 12;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    const hasNoRepeat = !/(.)\1{2,}/.test(pwd);
    let hasNoSequential = true;
    const lower = pwd.toLowerCase();
    for (let i = 0; i < lower.length - 2; i++) {
      const charCode = lower.charCodeAt(i);
      const next1 = lower.charCodeAt(i + 1);
      const next2 = lower.charCodeAt(i + 2);
      if (next1 === charCode + 1 && next2 === charCode + 2) {
        hasNoSequential = false;
        break;
      }
    }
    return hasLength && hasUpper && hasLower && hasNumber && hasSpecial && hasNoRepeat && hasNoSequential;
  };

  test('accepts strong compliant passwords meeting enterprise standards', () => {
    assert.equal(validatePolicy('Complex#Pass2026!'), true);
    assert.equal(validatePolicy('Secure_K8s#99Xy'), true);
  });

  test('rejects passwords failing minimum length or character class requirements', () => {
    assert.equal(validatePolicy('Short1!'), false); // Too short
    assert.equal(validatePolicy('alllowercase123!@#'), false); // No uppercase
    assert.equal(validatePolicy('ALLUPPERCASE123!@#'), false); // No lowercase
    assert.equal(validatePolicy('NoNumbersHere!@#'), false); // No digit
    assert.equal(validatePolicy('NoSpecialChar1234'), false); // No special symbol
  });

  test('rejects passwords with repeated or sequential characters', () => {
    assert.equal(validatePolicy('Paaaassword#1234'), false); // 'aaa' repeated
    assert.equal(validatePolicy('Valid#Passabc123'), false); // 'abc' sequential
  });
});

describe('Storefront Safe Redirect Contract (register -> verify -> login -> checkout)', () => {
  test('validates safe internal relative redirect path throughout auth lifecycle', () => {
    const rawRedirect = '/checkout';
    const safeTarget = isSafeLocalRedirect(rawRedirect, '/');
    assert.equal(safeTarget, '/checkout');

    // Registration preserves safe redirect into login URL
    const loginUrl = safeTarget !== '/'
      ? `/login?redirect=${encodeURIComponent(safeTarget)}`
      : '/login';
    assert.equal(loginUrl, '/login?redirect=%2Fcheckout');

    // Verification page forwards safe redirect into login URL
    const verifyPageLoginUrl = `/login?redirect=${encodeURIComponent(isSafeLocalRedirect(rawRedirect, '/'))}`;
    assert.equal(verifyPageLoginUrl, '/login?redirect=%2Fcheckout');
  });

  test('neutralizes open redirect attacks at each stage of the lifecycle', () => {
    const attackPayloads = [
      'https://evil.com/phish',
      'http://attacker.org',
      '//evil.com',
      '/\\evil.com',
      '\\evil.com',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '   //evil.com   ',
      '/%2f%2fevil.com'
    ];

    for (const payload of attackPayloads) {
      const sanitized = isSafeLocalRedirect(payload, '/');
      assert.equal(
        sanitized,
        '/',
        `Malicious payload "${payload}" must resolve to safe fallback "/"`
      );
    }
  });
});

describe('Email Verification & Auth UI Component Behavioral Contracts', () => {
  test('RegisterPage implements Check Your Email screen, email failure recovery alert, and resend action', () => {
    const registerSource = fs.readFileSync(path.resolve('src/app/register/page.tsx'), 'utf8');

    // Password policy integration
    assert.ok(registerSource.includes('validatePasswordPolicy'), 'Must import and use enterprise validatePasswordPolicy');
    assert.ok(registerSource.includes('12+ characters'), 'Must display 12+ characters policy checklist item');

    // Check your email screen
    assert.ok(registerSource.includes('Check Your Email'), 'Must render "Check Your Email" heading upon pending registration');
    assert.ok(registerSource.includes('pendingVerificationEmail'), 'Must track pending verification email state');

    // Email delivery failure notice
    assert.ok(registerSource.includes('emailDeliveryIssue'), 'Must track email delivery issue state');
    assert.ok(registerSource.includes('initial verification email could not be sent immediately'), 'Must render actionable non-secret delivery issue notice');

    // Resend verification action & states
    assert.ok(registerSource.includes('resendVerification'), 'Must bind to resendVerification store action');
    assert.ok(registerSource.includes('Resending Link...'), 'Must render active loading state for resend button');
    assert.ok(registerSource.includes('Resend Verification Email'), 'Must render resend verification action');

    // Proceed to login link
    assert.ok(registerSource.includes('Proceed to Login'), 'Must provide navigation to login');
  });

  test('LoginPage implements AUTH_EMAIL_NOT_VERIFIED callout, unverified email display, and inline resend', () => {
    const loginSource = fs.readFileSync(path.resolve('src/app/login/page.tsx'), 'utf8');

    // Unverified account callout
    assert.ok(loginSource.includes('AUTH_EMAIL_NOT_VERIFIED'), 'Must handle AUTH_EMAIL_NOT_VERIFIED code specifically');
    assert.ok(loginSource.includes('Email Not Verified'), 'Must render "Email Not Verified" alert banner');
    assert.ok(loginSource.includes('unverifiedEmail'), 'Must store and display unverified email');

    // Inline resend button and loading feedback
    assert.ok(loginSource.includes('Sending Verification Email...'), 'Must show loading indicator during resend');
    assert.ok(loginSource.includes('Resend Verification Email'), 'Must render inline resend verification button');

    // Safe redirect preservation
    assert.ok(loginSource.includes('isSafeLocalRedirect'), 'Must sanitize redirect target before pushing route');
  });

  test('VerifyEmailPage implements verifying, success, error/expired, and no-token states', () => {
    const verifySource = fs.readFileSync(path.resolve('src/app/verify-email/page.tsx'), 'utf8');
    const layoutSource = fs.readFileSync(path.resolve('src/app/verify-email/layout.tsx'), 'utf8');

    // Layout security metadata
    assert.ok(layoutSource.includes('index: false') || layoutSource.includes('noindex'), 'Verify email page must not be indexed by search engines');
    assert.ok(layoutSource.includes('follow: false') || layoutSource.includes('nofollow'), 'Verify email page links must not be followed');

    // State: Verifying
    assert.ok(verifySource.includes('Verifying Your Email'), 'Must display verifying state banner');
    assert.ok(verifySource.includes('verifyEmail(token)'), 'Must automatically call verifyEmail with URL token');

    // State: Success
    assert.ok(verifySource.includes('Email Verified Successfully!'), 'Must display success confirmation');
    assert.ok(verifySource.includes('Log In to Continue'), 'Must provide login CTA upon successful verification');

    // State: Error / Expired
    assert.ok(verifySource.includes('Verification Link Invalid or Expired'), 'Must display invalid/expired error state');

    // State: No token / Resend form
    assert.ok(verifySource.includes('Resend Verification Email'), 'Must provide standalone resend form when no token present');
    assert.ok(verifySource.includes('Sending New Link...'), 'Must provide active sending feedback during resend');
  });
});

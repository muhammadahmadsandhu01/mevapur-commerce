import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContentSecurityPolicy } from '../src/config/cspConfig.ts';

test('Production CSP excludes unsafe-eval', () => {
  const policy = buildContentSecurityPolicy({
    isProduction: true,
    apiUrl: 'https://api.mevapur.com'
  });

  assert.equal(policy.includes("'unsafe-eval'"), false, "Production CSP must not contain 'unsafe-eval'");
});

test('Production CSP script-src restricts to self and excludes unrestricted unsafe-inline', () => {
  const policy = buildContentSecurityPolicy({
    isProduction: true,
    apiUrl: 'https://api.mevapur.com'
  });

  const scriptDirective = policy
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('script-src'));

  assert.ok(scriptDirective, 'script-src directive must exist');
  assert.equal(scriptDirective, "script-src 'self'");
  assert.equal(scriptDirective.includes("'unsafe-inline'"), false, "Production script-src must not contain 'unsafe-inline'");
});

test('Development CSP explicitly gates unsafe-eval and unsafe-inline for HMR evaluation', () => {
  const policy = buildContentSecurityPolicy({
    isProduction: false,
    apiUrl: 'http://localhost:5000'
  });

  const scriptDirective = policy
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('script-src'));

  assert.ok(scriptDirective, 'script-src directive must exist');
  assert.ok(scriptDirective.includes("'unsafe-eval'"), 'Development script-src must permit unsafe-eval for fast refresh');
  assert.ok(scriptDirective.includes("'unsafe-inline'"), 'Development script-src must permit unsafe-inline for dev tooling');
});

test('Production CSP excludes loopback development hosts from connect-src', () => {
  const policy = buildContentSecurityPolicy({
    isProduction: true,
    apiUrl: 'https://api.mevapur.com'
  });

  const connectDirective = policy
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('connect-src'));

  assert.ok(connectDirective, 'connect-src directive must exist');
  assert.equal(connectDirective.includes('http://localhost'), false, 'Production must not contain localhost');
  assert.equal(connectDirective.includes('127.0.0.1'), false, 'Production must not contain 127.0.0.1');
  assert.equal(connectDirective.includes('https://api.mevapur.com'), true, 'Production must contain configured API origin');
});

test('Development CSP allows loopback hosts in connect-src for local services', () => {
  const policy = buildContentSecurityPolicy({
    isProduction: false,
    apiUrl: 'http://localhost:5000'
  });

  const connectDirective = policy
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('connect-src'));

  assert.ok(connectDirective, 'connect-src directive must exist');
  assert.ok(connectDirective.includes('http://localhost:*'));
  assert.ok(connectDirective.includes('http://127.0.0.1:*'));
});

test('Production CSP enforces security baselines: object-src, base-uri, frame-ancestors, upgrade-insecure-requests', () => {
  const policy = buildContentSecurityPolicy({
    isProduction: true,
    apiUrl: 'https://api.mevapur.com'
  });

  assert.ok(policy.includes("object-src 'none'"));
  assert.ok(policy.includes("base-uri 'self'"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(policy.includes("form-action 'self'"));
  assert.ok(policy.includes('upgrade-insecure-requests'));
});

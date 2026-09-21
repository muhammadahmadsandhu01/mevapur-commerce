/**
 * @file phase9-static-infrastructure.unit.test.js
 * @description Phase 9 Static Infrastructure Contract Tests:
 * 1. Dockerfiles adhere to pinned Node 24.20.0, non-root user (node), explicit WORKDIR, and multi-stage builds.
 * 2. .dockerignore excludes node_modules, .git, .env, patches, and build caches.
 * 3. Compose topology defines isolated networks, named persistent volumes, replica-set options, and healthchecks.
 * 4. Nginx proxy templates implement virtual host routing, webhook preservation, and metrics protection.
 * 5. Environment templates document secret vs non-secret classifications and safe defaults.
 */

'use strict';

const fs = require('fs');
const path = require('path');

describe('Phase 9 — Static Infrastructure Contract Tests', () => {
  const repoRoot = path.resolve(__dirname, '../../../');
  const backendDir = path.resolve(repoRoot, 'backend');
  const frontendDir = path.resolve(repoRoot, 'frontend');
  const adminDir = path.resolve(repoRoot, 'admin-panel');

  test('9.1 Dockerfiles are multi-stage, pinned to Node 24.20.0-alpine3.21, and run as non-root node user', () => {
    const dockerfiles = [
      path.join(backendDir, 'Dockerfile'),
      path.join(backendDir, 'Dockerfile.worker'),
      path.join(frontendDir, 'Dockerfile'),
      path.join(adminDir, 'Dockerfile')
    ];

    for (const dfPath of dockerfiles) {
      expect(fs.existsSync(dfPath)).toBe(true);
      const content = fs.readFileSync(dfPath, 'utf8');

      // Check pinned Node version
      expect(content).toMatch(/FROM node:24\.20\.0-alpine3\.21/);

      // Check non-root user
      expect(content).toMatch(/USER node/);

      // Check explicit WORKDIR
      expect(content).toMatch(/WORKDIR \/app/);

      // Check multi-stage builds
      expect(content).toMatch(/AS (dependencies|deps|builder|runner)/);
    }
  });

  test('9.2 .dockerignore files exclude sensitive artifacts, git history, and build caches', () => {
    const ignoreFiles = [
      path.join(repoRoot, '.dockerignore'),
      path.join(backendDir, '.dockerignore'),
      path.join(frontendDir, '.dockerignore'),
      path.join(adminDir, '.dockerignore')
    ];

    for (const ignPath of ignoreFiles) {
      expect(fs.existsSync(ignPath)).toBe(true);
      const content = fs.readFileSync(ignPath, 'utf8');

      expect(content).toMatch(/node_modules/);
      expect(content).toMatch(/\.git/);
      expect(content).toMatch(/\.env/);
      expect(content).toMatch(/admin-colors-reference\.patch/);
    }
  });

  test('9.3 docker-compose.yml defines isolated networks, named volumes, and healthchecks', () => {
    const composePath = path.join(repoRoot, 'docker-compose.yml');
    expect(fs.existsSync(composePath)).toBe(true);
    const content = fs.readFileSync(composePath, 'utf8');

    // Services
    expect(content).toMatch(/proxy:/);
    expect(content).toMatch(/backend:/);
    expect(content).toMatch(/frontend:/);
    expect(content).toMatch(/admin-panel:/);
    expect(content).toMatch(/mongodb:/);
    expect(content).toMatch(/redis:/);
    expect(content).toMatch(/worker-outbox:/);
    expect(content).toMatch(/worker-reconcile-sessions:/);

    // MongoDB replica-set configuration
    expect(content).toMatch(/--replSet/);
    expect(content).toMatch(/rs0/);

    // Pinned image versions
    expect(content).toMatch(/mongo:7\.0\.14-jammy/);
    expect(content).toMatch(/redis:7\.4\.1-alpine3\.20/);
    expect(content).toMatch(/nginx:1\.27\.2-alpine/);
    expect(content).toMatch(/prom\/prometheus:v2\.55\.1/);

    // Networks and volumes
    expect(content).toMatch(/frontend_net:/);
    expect(content).toMatch(/backend_net:\s*\n\s*driver:\s*bridge\s*\n\s*internal:\s*true/);
    expect(content).toMatch(/mongodb_data:/);
    expect(content).toMatch(/redis_data:/);
  });

  test('9.4 Nginx proxy templates protect internal metrics and preserve webhook signatures', () => {
    const localTemplatePath = path.join(repoRoot, 'docker/nginx/templates/default.conf.template');
    const prodTemplatePath = path.join(repoRoot, 'docker/nginx/templates/production.conf.template');

    expect(fs.existsSync(localTemplatePath)).toBe(true);
    expect(fs.existsSync(prodTemplatePath)).toBe(true);

    const localContent = fs.readFileSync(localTemplatePath, 'utf8');
    const prodContent = fs.readFileSync(prodTemplatePath, 'utf8');

    // Webhook forwarding preserves request bytes without proxy_set_body
    expect(localContent).toMatch(/location \/api\/payments\/webhooks/);
    expect(localContent).not.toMatch(/proxy_set_body/);

    // Deny public access to metrics
    expect(localContent).toMatch(/location \/api\/metrics\s*\{\s*return 403/);
    expect(prodContent).toMatch(/location \/api\/metrics\s*\{\s*return 403/);

    // Production template enforces TLS 1.2/1.3 and HSTS
    expect(prodContent).toMatch(/ssl_protocols TLSv1\.2 TLSv1\.3;/);
    expect(prodContent).toMatch(/Strict-Transport-Security/);
  });

  test('9.5 Environment example files provide sanitized templates without committed secrets', () => {
    const rootEnvExample = path.join(repoRoot, '.env.example');
    expect(fs.existsSync(rootEnvExample)).toBe(true);
    const content = fs.readFileSync(rootEnvExample, 'utf8');

    expect(content).toMatch(/MONGO_APP_USER/);
    expect(content).toMatch(/REDIS_PASSWORD/);
    expect(content).toMatch(/JWT_SECRET/);
    expect(content).not.toMatch(/sk_live_/);
    expect(content).not.toMatch(/ghp_/);
  });
});

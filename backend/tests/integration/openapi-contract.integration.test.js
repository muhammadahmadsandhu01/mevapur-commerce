const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../app');
const swaggerSpec = require('../../docs/swagger');

describe('OpenAPI Documentation Contract Integration Tests', () => {
  describe('Internal OpenAPI Specification Structure', () => {
    it('exports a valid OpenAPI 3.0.0 specification object', () => {
      expect(typeof swaggerSpec).toBe('object');
      expect(swaggerSpec).not.toBeNull();
      expect(swaggerSpec.openapi).toBe('3.0.0');
    });

    it('defines accurate HARZAAR API metadata and truthful single-merchant description', () => {
      expect(swaggerSpec.info).toBeDefined();
      expect(swaggerSpec.info.title).toBe('HARZAAR Commerce API');
      expect(typeof swaggerSpec.info.version).toBe('string');
      expect(swaggerSpec.info.version.length).toBeGreaterThan(0);

      const description = swaggerSpec.info.description || '';
      expect(description.toLowerCase()).not.toContain('marketplace');
      expect(description).not.toContain('production international activation');
      expect(description).toContain('HARZAAR');
      expect(description).toContain('single-merchant');
      expect(description).toContain('Pakistan');
    });

    it('explicitly declares x-documentation-status as partial', () => {
      const docStatus = swaggerSpec['x-documentation-status'] || swaggerSpec.info['x-documentation-status'];
      expect(docStatus).toBe('partial');
    });

    it('truthfully maintains paths object with exactly 0 undocumented route operations', () => {
      expect(typeof swaggerSpec.paths).toBe('object');
      expect(Object.keys(swaggerSpec.paths || {}).length).toBe(0);
    });

    it('retains canonical component schemas (User, Error, LoginRequest, RegisterRequest)', () => {
      expect(swaggerSpec.components).toBeDefined();
      expect(swaggerSpec.components.schemas).toBeDefined();

      const schemaKeys = Object.keys(swaggerSpec.components.schemas);
      expect(schemaKeys).toContain('User');
      expect(schemaKeys).toContain('Error');
      expect(schemaKeys).toContain('LoginRequest');
      expect(schemaKeys).toContain('RegisterRequest');
    });

    it('defines bearerAuth and cookieAuth security schemes', () => {
      expect(swaggerSpec.components.securitySchemes).toBeDefined();
      expect(swaggerSpec.components.securitySchemes.bearerAuth).toBeDefined();
      expect(swaggerSpec.components.securitySchemes.bearerAuth.type).toBe('http');
      expect(swaggerSpec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');

      expect(swaggerSpec.components.securitySchemes.cookieAuth).toBeDefined();
      expect(swaggerSpec.components.securitySchemes.cookieAuth.type).toBe('apiKey');
      expect(swaggerSpec.components.securitySchemes.cookieAuth.in).toBe('cookie');
    });
  });

  describe('Runtime Endpoint Non-Exposure', () => {
    it('returns 404 for GET /api-docs (no runtime Swagger UI)', async () => {
      const response = await request(app).get('/api-docs');
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        message: 'Route not found'
      });
    });

    it('returns 404 for GET /docs.json (no runtime raw spec endpoint)', async () => {
      const response = await request(app).get('/docs.json');
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        message: 'Route not found'
      });
    });
  });

  describe('Package Manifest Dependency Ownership', () => {
    it('verifies swagger-ui-express is removed and swagger-jsdoc is pinned in devDependencies', () => {
      const packageJsonPath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      const prodDeps = packageJson.dependencies || {};
      const devDeps = packageJson.devDependencies || {};

      expect(prodDeps['swagger-ui-express']).toBeUndefined();
      expect(devDeps['swagger-ui-express']).toBeUndefined();
      expect(prodDeps['swagger-jsdoc']).toBeUndefined();
      expect(devDeps['swagger-jsdoc']).toBe('6.3.0');
    });
  });
});

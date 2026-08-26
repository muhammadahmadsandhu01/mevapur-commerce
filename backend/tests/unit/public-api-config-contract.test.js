const fs = require('fs');
const path = require('path');
const frontendContract = require('../../../frontend/src/config/publicApiContract');
const adminContract = require('../../../admin-panel/src/config/publicApiContract');

const ownerBackendOrigin = 'https://mevapur-backend.onrender.com';

describe('Frontend/Admin public API configuration contract', () => {
  test.each([
    ['frontend', frontendContract.resolvePublicApiContract],
    ['admin', adminContract.resolvePublicApiContract]
  ])('%s production configuration fails closed when missing', (_name, resolve) => {
    expect(() => resolve(undefined, { environment: 'production' }))
      .toThrow('NEXT_PUBLIC_API_URL is required for production builds');
  });

  test.each([
    'http://localhost:5000',
    'https://localhost',
    'https://api.example.com',
    'not-a-url'
  ])('production rejects local, stale, or invalid API value: %s', (value) => {
    expect(() => frontendContract.resolvePublicApiContract(value, {
      environment: 'production'
    })).toThrow();
  });

  test('development has an explicit loopback default', () => {
    expect(frontendContract.resolvePublicApiContract(undefined, {
      environment: 'development'
    })).toEqual({
      apiOrigin: 'http://localhost:5000',
      apiBaseUrl: 'http://localhost:5000/api'
    });
  });

  test('normalizes the owner backend origin to exactly one /api segment', () => {
    const result = frontendContract.resolvePublicApiContract(
      `${ownerBackendOrigin}/`,
      { environment: 'production' }
    );
    expect(result).toEqual({
      apiOrigin: ownerBackendOrigin,
      apiBaseUrl: `${ownerBackendOrigin}/api`
    });
    expect(result.apiBaseUrl).not.toContain('/api/api');
    expect(() => frontendContract.resolvePublicApiContract(
      `${ownerBackendOrigin}/api`,
      { environment: 'production' }
    )).toThrow('must be an origin without /api');
  });

  test('Frontend and Admin implementations and outputs remain identical', () => {
    const frontendPath = path.resolve(
      __dirname,
      '../../../frontend/src/config/publicApiContract.js'
    );
    const adminPath = path.resolve(
      __dirname,
      '../../../admin-panel/src/config/publicApiContract.js'
    );
    expect(fs.readFileSync(frontendPath, 'utf8'))
      .toBe(fs.readFileSync(adminPath, 'utf8'));
    expect(frontendContract.resolvePublicApiContract(ownerBackendOrigin, {
      environment: 'production'
    })).toEqual(adminContract.resolvePublicApiContract(ownerBackendOrigin, {
      environment: 'production'
    }));
  });

  test('production examples use the documented origin without /api', () => {
    for (const file of [
      '../../../frontend/.env.production.example',
      '../../../admin-panel/.env.production.example'
    ]) {
      const contents = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
      expect(contents).toContain(`NEXT_PUBLIC_API_URL=${ownerBackendOrigin}`);
      expect(contents).not.toContain(`NEXT_PUBLIC_API_URL=${ownerBackendOrigin}/api`);
    }
  });
});

/**
 * @file fulfillment-location.unit.test.js
 * @description Unit tests for FulfillmentLocation model, lifecycle, ISO country validation,
 * IANA timezone validation, and tenant-scoped identity rules in Phase 6D-2.
 */

const mongoose = require('mongoose');
const FulfillmentLocation = require('../../models/FulfillmentLocation');

describe('Phase 6D-2: FulfillmentLocation Unit Tests', () => {
  describe('Schema Validation & Constraints', () => {
    it('validates a valid fulfillment location successfully', async () => {
      const location = new FulfillmentLocation({
        merchantScopeId: 'default',
        locationCode: 'WH-LHE-01',
        displayName: 'Lahore Central Hub',
        status: 'active',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        priority: 10,
        supportedMarketCountries: ['PK', 'AE', 'SA'],
        supportedServiceLevels: ['standard', 'express'],
        capabilities: ['local_delivery', 'cross_border'],
        returnCapabilities: ['accept_returns', 'restock'],
        isDefault: true
      });

      const err = location.validateSync();
      expect(err).toBeUndefined();
      expect(location.countryCode).toBe('PK');
      expect(location.priority).toBe(10);
    });

    it('rejects an invalid ISO 3166-1 alpha-2 country code', () => {
      const location = new FulfillmentLocation({
        merchantScopeId: 'default',
        locationCode: 'WH-INVALID-01',
        displayName: 'Invalid Country Hub',
        countryCode: 'XX', // Invalid country
        city: 'Metropolis',
        timeZone: 'UTC'
      });

      const err = location.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['countryCode']).toBeDefined();
    });

    it('rejects an invalid IANA timezone identifier', () => {
      const location = new FulfillmentLocation({
        merchantScopeId: 'default',
        locationCode: 'WH-INVALID-TZ',
        displayName: 'Invalid Timezone Hub',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Mars/Phobos' // Invalid timezone
      });

      const err = location.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['timeZone']).toBeDefined();
    });

    it('rejects invalid location codes with lowercase or illegal characters', () => {
      const location = new FulfillmentLocation({
        merchantScopeId: 'default',
        locationCode: 'invalid code!',
        displayName: 'Bad Code Hub',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi'
      });

      const err = location.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['locationCode']).toBeDefined();
    });

    it('strips warehouse street address in toPublic serialization', () => {
      const location = new FulfillmentLocation({
        merchantScopeId: 'default',
        locationCode: 'WH-SECRET-01',
        displayName: 'Public Hub',
        countryCode: 'PK',
        city: 'Lahore',
        addressLine1: 'Top Secret Warehouse Street 42',
        addressLine2: 'Bay 9',
        postalCode: '54000',
        timeZone: 'Asia/Karachi'
      });

      const pub = location.toPublic();
      expect(pub.locationCode).toBe('WH-SECRET-01');
      expect(pub.city).toBe('Lahore');
      expect(pub.addressLine1).toBeUndefined();
      expect(pub.addressLine2).toBeUndefined();
      expect(pub.postalCode).toBeUndefined();
    });
  });
});

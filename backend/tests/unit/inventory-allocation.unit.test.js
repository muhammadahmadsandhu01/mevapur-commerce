/**
 * @file inventory-allocation.unit.test.js
 * @description Unit tests for InventoryAllocationService sorting rules, single-origin preference,
 * deterministic tie-breaking, split fulfillment constraints, and preview contracts in Phase 6D-2.
 */

const mongoose = require('mongoose');
const InventoryAllocationService = require('../../services/inventory/InventoryAllocationService');

describe('Phase 6D-2: InventoryAllocationService Unit Tests', () => {
  describe('Deterministic Location Sorting', () => {
    it('ranks full-coverage location above partial-coverage location regardless of priority', () => {
      const locPartial = {
        _id: new mongoose.Types.ObjectId(),
        locationCode: 'LOC-A',
        countryCode: 'PK',
        priority: 10,
        supportedServiceLevels: ['standard']
      };

      const locFull = {
        _id: new mongoose.Types.ObjectId(),
        locationCode: 'LOC-B',
        countryCode: 'PK',
        priority: 100, // lower priority number, but full coverage
        supportedServiceLevels: ['standard']
      };

      const fullCoverageMap = new Map([
        [String(locPartial._id), false],
        [String(locFull._id), true]
      ]);

      const sorted = InventoryAllocationService.sortLocations([locPartial, locFull], {
        destinationCountry: 'PK',
        serviceLevel: 'standard',
        fullCoverageMap
      });

      expect(sorted[0].locationCode).toBe('LOC-B');
    });

    it('ranks domestic location above foreign location when both have full coverage', () => {
      const locForeign = {
        _id: new mongoose.Types.ObjectId(),
        locationCode: 'LOC-UK',
        countryCode: 'GB',
        priority: 10,
        supportedServiceLevels: ['standard']
      };

      const locDomestic = {
        _id: new mongoose.Types.ObjectId(),
        locationCode: 'LOC-PK',
        countryCode: 'PK',
        priority: 50,
        supportedServiceLevels: ['standard']
      };

      const fullCoverageMap = new Map([
        [String(locForeign._id), true],
        [String(locDomestic._id), true]
      ]);

      const sorted = InventoryAllocationService.sortLocations([locForeign, locDomestic], {
        destinationCountry: 'PK',
        serviceLevel: 'standard',
        fullCoverageMap
      });

      expect(sorted[0].locationCode).toBe('LOC-PK');
    });

    it('ranks lower priority number above higher priority number when other factors are equal', () => {
      const locPriority10 = {
        _id: new mongoose.Types.ObjectId(),
        locationCode: 'LOC-10',
        countryCode: 'PK',
        priority: 10,
        supportedServiceLevels: ['standard']
      };

      const locPriority50 = {
        _id: new mongoose.Types.ObjectId(),
        locationCode: 'LOC-50',
        countryCode: 'PK',
        priority: 50,
        supportedServiceLevels: ['standard']
      };

      const fullCoverageMap = new Map([
        [String(locPriority10._id), true],
        [String(locPriority50._id), true]
      ]);

      const sorted = InventoryAllocationService.sortLocations([locPriority50, locPriority10], {
        destinationCountry: 'PK',
        serviceLevel: 'standard',
        fullCoverageMap
      });

      expect(sorted[0].locationCode).toBe('LOC-10');
    });

    it('uses lexicographical locationCode as stable tie-breaker when all metrics are identical', () => {
      const locB = {
        _id: new mongoose.Types.ObjectId(),
        locationCode: 'WH-B',
        countryCode: 'PK',
        priority: 10,
        supportedServiceLevels: ['standard']
      };

      const locA = {
        _id: new mongoose.Types.ObjectId(),
        locationCode: 'WH-A',
        countryCode: 'PK',
        priority: 10,
        supportedServiceLevels: ['standard']
      };

      const fullCoverageMap = new Map([
        [String(locB._id), true],
        [String(locA._id), true]
      ]);

      const sorted = InventoryAllocationService.sortLocations([locB, locA], {
        destinationCountry: 'PK',
        serviceLevel: 'standard',
        fullCoverageMap
      });

      expect(sorted[0].locationCode).toBe('WH-A');
      expect(sorted[1].locationCode).toBe('WH-B');
    });
  });
});

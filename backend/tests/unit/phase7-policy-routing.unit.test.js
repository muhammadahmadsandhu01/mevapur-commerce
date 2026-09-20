/**
 * @file phase7-policy-routing.unit.test.js
 * @description Unit tests for country-policy snapshots, eligibility deadlines, and cross-border return routing.
 */

'use strict';

const mongoose = require('mongoose');
const ReturnRoutingService = require('../../services/shipping/ReturnRoutingService');
const ReturnService = require('../../services/ReturnService');
const Order = require('../../models/Order');
const Return = require('../../models/Return');
const { Money, MoneyMapper } = require('../../modules/commerce');

describe('Phase 7 — Country-Policy Snapshots & Return Routing', () => {
  const dummyProductId = new mongoose.Types.ObjectId();

  describe('Return Policy Snapshot & Eligibility Boundaries', () => {
    it('enforces order-time policy windowDays rather than mutable global defaults', () => {
      const deliveredDate = new Date(Date.now() - 40 * 86400000); // 40 days ago
      const order = {
        _id: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        orderStatus: 'Delivered',
        deliveredAt: deliveredDate,
        returnPolicySnapshot: {
          windowDays: 60, // 60 days allowed under snapshot
          eligibleStatus: 'Delivered'
        }
      };

      // Should not throw because 40 days < 60 days window
      expect(() => {
        ReturnService.assertCustomerEligibility(order, order.user);
      }).not.toThrow();
    });

    it('rejects return request when deliveredAt exceeds snapshot windowDays', () => {
      const deliveredDate = new Date(Date.now() - 35 * 86400000); // 35 days ago
      const order = {
        _id: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        orderStatus: 'Delivered',
        deliveredAt: deliveredDate,
        returnPolicySnapshot: {
          windowDays: 30, // 30 days window
          eligibleStatus: 'Delivered'
        }
      };

      expect(() => {
        ReturnService.assertCustomerEligibility(order, order.user);
      }).toThrow('This order is not eligible for a return request');
    });

    it('rejects return request when orderStatus does not match snapshot eligibleStatus', () => {
      const order = {
        _id: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        orderStatus: 'Shipped',
        deliveredAt: new Date(),
        returnPolicySnapshot: {
          windowDays: 30,
          eligibleStatus: 'Delivered'
        }
      };

      expect(() => {
        ReturnService.assertCustomerEligibility(order, order.user);
      }).toThrow('This order is not eligible for a return request');
    });
  });

  describe('Cross-Border & Domestic Return Routing Decision Engine', () => {
    it('routes domestic return to domestic merchant warehouse', async () => {
      const order = {
        _id: new mongoose.Types.ObjectId(),
        shippingAddress: { countryCode: 'PK', country: 'Pakistan' },
        items: [{ originCountry: 'PK', product: dummyProductId, quantity: 1 }]
      };
      const items = [{ product: dummyProductId, quantity: 1, reason: 'not_satisfied' }];

      const routing = await ReturnRoutingService.determineRouting({ order, items });
      expect(routing.routingStrategy).toBe('MERCHANT_WAREHOUSE');
      expect(routing.destinationCountry).toBe('PK');
      expect(routing.responsibleParty).toBe('CUSTOMER');
      expect(routing.costResponsibility).toBe('CUSTOMER');
    });

    it('assigns MERCHANT cost responsibility when reason is merchant fault (damaged/wrong_item)', async () => {
      const order = {
        _id: new mongoose.Types.ObjectId(),
        shippingAddress: { countryCode: 'PK', country: 'Pakistan' },
        items: [{ originCountry: 'PK', product: dummyProductId, quantity: 1 }]
      };
      const items = [{ product: dummyProductId, quantity: 1, reason: 'damaged' }];

      const routing = await ReturnRoutingService.determineRouting({ order, items });
      expect(routing.responsibleParty).toBe('MERCHANT');
      expect(routing.costResponsibility).toBe('MERCHANT');
    });

    it('routes restricted/non-returnable goods to RESTRICTED_GOODS strategy', async () => {
      const order = {
        _id: new mongoose.Types.ObjectId(),
        shippingAddress: { countryCode: 'US', country: 'United States' },
        items: [{ originCountry: 'PK', product: dummyProductId, quantity: 1 }]
      };
      const items = [{
        product: dummyProductId,
        quantity: 1,
        reason: 'not_satisfied',
        isRestricted: true
      }];

      const routing = await ReturnRoutingService.determineRouting({ order, items });
      expect(routing.routingStrategy).toBe('RESTRICTED_GOODS');
      expect(routing.costResponsibility).toBe('WAIVED');
      expect(routing.routingReason).toContain('restricted');
    });

    it('routes international return to RETURN_TO_ORIGIN when no local hub exists', async () => {
      const order = {
        _id: new mongoose.Types.ObjectId(),
        shippingAddress: { countryCode: 'US', country: 'United States' },
        items: [{ originCountry: 'PK', product: dummyProductId, quantity: 1 }]
      };
      const items = [{ product: dummyProductId, quantity: 1, reason: 'not_as_described' }];

      const routing = await ReturnRoutingService.determineRouting({ order, items });
      expect(routing.routingStrategy).toBe('RETURN_TO_ORIGIN');
      expect(routing.destinationCountry).toBe('PK');
      expect(routing.responsibleParty).toBe('MERCHANT');
    });
  });
});

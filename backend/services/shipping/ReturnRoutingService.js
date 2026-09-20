/**
 * @file ReturnRoutingService.js
 * @description Governed cross-border and domestic return routing decision engine.
 * Computes deterministic return routing strategy, destination fulfillment location/hub,
 * cost responsibility, and immutable routing snapshots based on order provenance,
 * incoterms, product classification, and country policy.
 */

'use strict';

const FulfillmentLocation = require('../../models/FulfillmentLocation');
const { Money, MoneyMapper } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');

const ROUTING_STRATEGIES = Object.freeze({
  LOCAL_HUB: 'LOCAL_HUB',
  RETURN_TO_ORIGIN: 'RETURN_TO_ORIGIN',
  MERCHANT_WAREHOUSE: 'MERCHANT_WAREHOUSE',
  CARRIER_DISPOSAL: 'CARRIER_DISPOSAL',
  CUSTOMER_KEEPS_ITEM: 'CUSTOMER_KEEPS_ITEM',
  RESTRICTED_GOODS: 'RESTRICTED_GOODS'
});

const RESPONSIBLE_PARTIES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  MERCHANT: 'MERCHANT',
  CARRIER: 'CARRIER'
});

const COST_RESPONSIBILITIES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  MERCHANT: 'MERCHANT',
  CARRIER: 'CARRIER',
  WAIVED: 'WAIVED'
});

class ReturnRoutingService {
  /**
   * Determine deterministic return routing decision and snapshot for a return request.
   * @param {Object} options
   * @param {Object} options.order - Authoritative Order document
   * @param {Array<Object>} options.items - Validated canonical return items
   * @param {Object} [options.policySnapshot] - Order-time or active return policy snapshot
   * @param {Object} [options.session=null] - Optional Mongoose session
   * @returns {Promise<Object>} Immutable returnRoutingSnapshot
   */
  async determineRouting({ order, items, policySnapshot = null, session = null }) {
    if (!order) {
      throw new AppError('Order is required to determine return routing', 400, 'RETURN_ROUTING_ORDER_REQUIRED');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Return items are required to determine return routing', 400, 'RETURN_ROUTING_ITEMS_REQUIRED');
    }

    const destinationCountry = (
      order.shippingAddress?.countryCode
      || order.shippingAddress?.country
      || 'PK'
    ).trim().toUpperCase();

    // Check for restricted / non-returnable categories or condition
    const nonReturnableCategories = policySnapshot?.nonReturnableCategories || [];
    const hasRestrictedItem = items.some((item) => (
      item.isRestricted
      || item.nonReturnable
      || (item.category && nonReturnableCategories.includes(item.category))
    ));

    if (hasRestrictedItem) {
      return {
        routingStrategy: ROUTING_STRATEGIES.RESTRICTED_GOODS,
        destinationLocationId: null,
        destinationLocationCode: '',
        destinationCountry,
        responsibleParty: RESPONSIBLE_PARTIES.CUSTOMER,
        costResponsibility: COST_RESPONSIBILITIES.WAIVED,
        estimatedReturnShippingCostExact: null,
        routingReason: 'One or more items are classified as non-returnable or restricted goods.',
        decidedAt: new Date()
      };
    }

    // Determine fault / cost responsibility from return reasons
    const merchantFaultReasons = new Set(['damaged', 'wrong_item', 'not_as_described']);
    const isMerchantFault = items.every((item) => merchantFaultReasons.has(item.reason));
    const isPartialMerchantFault = items.some((item) => merchantFaultReasons.has(item.reason));

    let costResponsibility = COST_RESPONSIBILITIES.CUSTOMER;
    let responsibleParty = RESPONSIBLE_PARTIES.CUSTOMER;

    if (isMerchantFault || isPartialMerchantFault) {
      costResponsibility = COST_RESPONSIBILITIES.MERCHANT;
      responsibleParty = RESPONSIBLE_PARTIES.MERCHANT;
    } else if (policySnapshot?.returnShippingCostPayer === 'MERCHANT') {
      costResponsibility = COST_RESPONSIBILITIES.MERCHANT;
      responsibleParty = RESPONSIBLE_PARTIES.MERCHANT;
    } else if (policySnapshot?.returnShippingCostPayer === 'SHARED') {
      costResponsibility = COST_RESPONSIBILITIES.CUSTOMER;
      responsibleParty = RESPONSIBLE_PARTIES.CUSTOMER;
    }

    // Check if items are severely damaged or customer-keeps-item policy applies
    const allDamaged = items.every((item) => item.condition === 'damaged' || item.reason === 'damaged');
    if (allDamaged && policySnapshot?.allowNoReturnDisposal) {
      return {
        routingStrategy: ROUTING_STRATEGIES.CUSTOMER_KEEPS_ITEM,
        destinationLocationId: null,
        destinationLocationCode: '',
        destinationCountry,
        responsibleParty: RESPONSIBLE_PARTIES.MERCHANT,
        costResponsibility: COST_RESPONSIBILITIES.WAIVED,
        estimatedReturnShippingCostExact: null,
        routingReason: 'Damaged item eligible for no-return refund under policy.',
        decidedAt: new Date()
      };
    }

    // Query fulfillment locations
    const query = FulfillmentLocation.find({ enabled: true });
    if (session) query.session(session);
    const locations = await query.exec();

    // Find origin fulfillment location for this order
    const firstOrderItem = order.items?.[0];
    const orderOriginCountry = (firstOrderItem?.originCountry || 'PK').toUpperCase();
    const isDomestic = (destinationCountry === orderOriginCountry);

    if (isDomestic) {
      // Domestic: route to local fulfillment origin or default merchant warehouse
      const matchingOrigin = locations.find((loc) => (
        loc.country === destinationCountry && loc.isDefault
      )) || locations.find((loc) => loc.country === destinationCountry) || locations[0];

      return {
        routingStrategy: ROUTING_STRATEGIES.MERCHANT_WAREHOUSE,
        destinationLocationId: matchingOrigin?._id || null,
        destinationLocationCode: matchingOrigin?.locationCode || 'DOMESTIC_WH',
        destinationCountry,
        responsibleParty,
        costResponsibility,
        estimatedReturnShippingCostExact: null,
        routingReason: 'Domestic return routed to primary domestic fulfillment warehouse.',
        decidedAt: new Date()
      };
    }

    // Cross-border return routing
    // 1. Check if there is a local return hub in customer's destination country
    const localHub = locations.find((loc) => (
      loc.country === destinationCountry
      && (loc.type === 'hub' || loc.isReturnHub || loc.capabilities?.includes?.('returns'))
    )) || locations.find((loc) => loc.country === destinationCountry);

    if (localHub) {
      return {
        routingStrategy: ROUTING_STRATEGIES.LOCAL_HUB,
        destinationLocationId: localHub._id,
        destinationLocationCode: localHub.locationCode || 'LOCAL_HUB',
        destinationCountry: localHub.country,
        responsibleParty,
        costResponsibility,
        estimatedReturnShippingCostExact: null,
        routingReason: `Cross-border return routed to local return consolidation hub in ${destinationCountry}.`,
        decidedAt: new Date()
      };
    }

    // 2. Return to origin warehouse
    const originLocation = locations.find((loc) => (
      loc.country === orderOriginCountry && loc.isDefault
    )) || locations.find((loc) => loc.country === orderOriginCountry) || locations[0];

    return {
      routingStrategy: ROUTING_STRATEGIES.RETURN_TO_ORIGIN,
      destinationLocationId: originLocation?._id || null,
      destinationLocationCode: originLocation?.locationCode || 'ORIGIN_WH',
      destinationCountry: orderOriginCountry,
      responsibleParty,
      costResponsibility,
      estimatedReturnShippingCostExact: null,
      routingReason: `No local hub in ${destinationCountry}; routed international return to origin in ${orderOriginCountry}.`,
      decidedAt: new Date()
    };
  }
}

module.exports = new ReturnRoutingService();
module.exports.ROUTING_STRATEGIES = ROUTING_STRATEGIES;
module.exports.RESPONSIBLE_PARTIES = RESPONSIBLE_PARTIES;
module.exports.COST_RESPONSIBILITIES = COST_RESPONSIBILITIES;

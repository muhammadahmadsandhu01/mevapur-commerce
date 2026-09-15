/**
 * @file InventoryAllocationService.js
 * @description Deterministic, tenant-scoped inventory allocation engine for Phase 6D-2.
 * Evaluates candidate fulfillment locations, respects market authorizations, enforces single-origin preference,
 * implements deterministic tie-breaking, and provides zero-side-effect quote allocation preview.
 */

const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class InventoryAllocationService {
  /**
   * Deterministically order candidate fulfillment locations based on governed attributes.
   * Priority:
   *  1. Capable of fully satisfying all lines (single-origin)
   *  2. Located in the destination country (domestic proximity)
   *  3. Configured fulfillment priority (ascending: 10 before 100)
   *  4. Service level eligibility (supports requested service level)
   *  5. Highest aggregate remaining ATP across lines
   *  6. Stable locationCode lexicographical tie-breaker
   */
  sortLocations(locations, { destinationCountry, serviceLevel = 'standard', fullCoverageMap = new Map(), totalAtpMap = new Map() }) {
    return [...locations].sort((a, b) => {
      // 1. Full coverage preference
      const aFull = fullCoverageMap.get(String(a._id)) ? 1 : 0;
      const bFull = fullCoverageMap.get(String(b._id)) ? 1 : 0;
      if (aFull !== bFull) return bFull - aFull;

      // 2. Domestic proximity (same country as destination)
      const aDomestic = a.countryCode === destinationCountry ? 1 : 0;
      const bDomestic = b.countryCode === destinationCountry ? 1 : 0;
      if (aDomestic !== bDomestic) return bDomestic - aDomestic;

      // 3. Configured fulfillment priority (lower number = higher priority)
      const aPriority = Number.isFinite(a.priority) ? a.priority : 100;
      const bPriority = Number.isFinite(b.priority) ? b.priority : 100;
      if (aPriority !== bPriority) return aPriority - bPriority;

      // 4. Service level eligibility
      const aService = Array.isArray(a.supportedServiceLevels) && a.supportedServiceLevels.includes(serviceLevel.toLowerCase()) ? 1 : 0;
      const bService = Array.isArray(b.supportedServiceLevels) && b.supportedServiceLevels.includes(serviceLevel.toLowerCase()) ? 1 : 0;
      if (aService !== bService) return bService - aService;

      // 5. Aggregate remaining ATP across requested items
      const aAtp = totalAtpMap.get(String(a._id)) || 0;
      const bAtp = totalAtpMap.get(String(b._id)) || 0;
      if (aAtp !== bAtp) return bAtp - aAtp;

      // 6. Stable locationCode tie-breaker
      return String(a.locationCode).localeCompare(String(b.locationCode));
    });
  }

  /**
   * Evaluate candidate locations and compute deterministic allocation for line items.
   * @param {Object} params
   * @param {Array<Object>} params.items - Ordered line items
   * @param {string} params.destinationCountry - ISO 3166-1 alpha-2 destination
   * @param {string} [params.merchantScopeId='default']
   * @param {string} [params.serviceLevel='standard']
   * @param {boolean} [params.allowSplit=false]
   * @param {number} [params.maxShipmentGroups=3]
   * @param {Object} [params.session=null]
   * @returns {Promise<Object>}
   */
  async allocate({
    items,
    destinationCountry,
    merchantScopeId = 'default',
    serviceLevel = 'standard',
    allowSplit = false,
    maxShipmentGroups = 3,
    session = null
  }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Line items are required for inventory allocation', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    if (!destinationCountry || typeof destinationCountry !== 'string') {
      throw new AppError('Destination country is required for inventory allocation', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const normDestCountry = destinationCountry.trim().toUpperCase();
    const now = new Date();

    // 1. Fetch eligible active fulfillment locations authorized for destination country
    const locationQuery = {
      merchantScopeId,
      status: 'active',
      supportedMarketCountries: normDestCountry,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
    };

    let locQuery = FulfillmentLocation.find(locationQuery);
    if (session) locQuery = locQuery.session(session);
    const activeLocations = await locQuery;

    if (activeLocations.length === 0) {
      return {
        success: false,
        reason: 'NO_ACTIVE_FULFILLMENT_LOCATIONS',
        message: `No active fulfillment locations are authorized to serve destination country '${normDestCountry}'`,
        allocations: [],
        shipmentGroups: []
      };
    }

    // 2. Fetch inventory positions for all requested items across active locations
    const productIds = items.map((it) => it.product || it.productId);
    const locationIds = activeLocations.map((loc) => loc._id);

    let posQuery = InventoryPosition.find({
      merchantScopeId,
      locationId: { $in: locationIds },
      productId: { $in: productIds }
    });
    if (session) posQuery = posQuery.session(session);
    const positions = await posQuery;

    // Build fast position lookup map: `${locationId}:${productId}:${scopeKey}` -> InventoryPosition
    const positionMap = new Map();
    positions.forEach((pos) => {
      const key = `${pos.locationId}:${pos.productId}:${pos.scopeKey}`;
      positionMap.set(key, pos);
    });

    // 3. Evaluate each location for coverage and aggregate ATP
    const fullCoverageMap = new Map();
    const totalAtpMap = new Map();
    const locationCoverageDetails = new Map();

    for (const loc of activeLocations) {
      const locIdStr = String(loc._id);
      let isFullyCovered = true;
      let totalAtp = 0;
      const lineDetails = [];

      for (const item of items) {
        const prodId = String(item.product || item.productId);
        const variantId = item.variantId ? String(item.variantId) : null;
        const scopeKey = variantId || 'product';
        const requiredQty = Number(item.quantity);

        const pos = positionMap.get(`${loc._id}:${prodId}:${scopeKey}`);
        const atp = pos ? pos.calculateATP() : 0;
        totalAtp += atp;

        const hasSufficient = atp >= requiredQty;
        if (!hasSufficient) {
          isFullyCovered = false;
        }

        lineDetails.push({
          productId: prodId,
          variantId,
          canonicalSku: pos?.canonicalSku || item.sku || '',
          requiredQty,
          atp,
          hasSufficient,
          position: pos || null
        });
      }

      fullCoverageMap.set(locIdStr, isFullyCovered);
      totalAtpMap.set(locIdStr, totalAtp);
      locationCoverageDetails.set(locIdStr, lineDetails);
    }

    // 4. Sort candidate locations deterministically
    const sortedLocations = this.sortLocations(activeLocations, {
      destinationCountry: normDestCountry,
      serviceLevel,
      fullCoverageMap,
      totalAtpMap
    });

    // 5. Try Single-Origin Full Allocation
    for (const loc of sortedLocations) {
      const locIdStr = String(loc._id);
      const isFullyCovered = fullCoverageMap.get(locIdStr);

      if (isFullyCovered) {
        const lineDetails = locationCoverageDetails.get(locIdStr);
        const allocations = lineDetails.map((ld, idx) => ({
          locationId: loc._id,
          locationCode: loc.locationCode,
          originCountry: loc.countryCode,
          productId: ld.productId,
          variantId: ld.variantId,
          canonicalSku: ld.canonicalSku,
          quantity: ld.requiredQty,
          inventoryPositionId: ld.position._id,
          inventoryLockVersion: ld.position.lockVersion,
          fulfillmentMode: loc.countryCode === normDestCountry ? 'local' : 'cross_border',
          shipmentGroup: 'group_1'
        }));

        return {
          success: true,
          strategy: 'single_origin',
          fulfillmentLocationId: loc._id,
          locationCode: loc.locationCode,
          originCountry: loc.countryCode,
          shipmentGroups: [{
            shipmentGroup: 'group_1',
            locationId: loc._id,
            locationCode: loc.locationCode,
            originCountry: loc.countryCode,
            fulfillmentMode: loc.countryCode === normDestCountry ? 'local' : 'cross_border',
            items: allocations
          }],
          allocations
        };
      }
    }

    // 6. Handle Split Fulfillment if enabled
    if (!allowSplit) {
      return {
        success: false,
        reason: 'INSUFFICIENT_STOCK_SINGLE_ORIGIN',
        message: 'No single fulfillment location has sufficient available inventory to fulfill all items',
        allocations: [],
        shipmentGroups: []
      };
    }

    // Attempt multi-location split allocation (greedy deterministic by sorted locations)
    const remainingToAllocate = items.map((it) => ({
      productId: String(it.product || it.productId),
      variantId: it.variantId ? String(it.variantId) : null,
      scopeKey: it.variantId ? String(it.variantId) : 'product',
      canonicalSku: it.sku || '',
      quantityNeeded: Number(it.quantity)
    }));

    const splitAllocations = [];
    const usedLocations = [];

    for (const loc of sortedLocations) {
      if (usedLocations.length >= maxShipmentGroups && !usedLocations.includes(String(loc._id))) {
        continue;
      }

      let allocatedAnyFromThisLoc = false;
      const groupName = `group_${usedLocations.length + (usedLocations.includes(String(loc._id)) ? 0 : 1)}`;

      for (const req of remainingToAllocate) {
        if (req.quantityNeeded <= 0) continue;

        const pos = positionMap.get(`${loc._id}:${req.productId}:${req.scopeKey}`);
        if (!pos) continue;

        const atp = pos.calculateATP();
        if (atp <= 0) continue;

        const qtyToTake = Math.min(req.quantityNeeded, atp);
        if (qtyToTake > 0) {
          req.quantityNeeded -= qtyToTake;
          allocatedAnyFromThisLoc = true;

          splitAllocations.push({
            locationId: loc._id,
            locationCode: loc.locationCode,
            originCountry: loc.countryCode,
            productId: req.productId,
            variantId: req.variantId,
            canonicalSku: pos.canonicalSku || req.canonicalSku,
            quantity: qtyToTake,
            inventoryPositionId: pos._id,
            inventoryLockVersion: pos.lockVersion,
            fulfillmentMode: loc.countryCode === normDestCountry ? 'local' : 'cross_border',
            shipmentGroup: groupName
          });
        }
      }

      if (allocatedAnyFromThisLoc && !usedLocations.includes(String(loc._id))) {
        usedLocations.push(String(loc._id));
      }

      const allSatisfied = remainingToAllocate.every((r) => r.quantityNeeded === 0);
      if (allSatisfied) {
        break;
      }
    }

    const allSatisfied = remainingToAllocate.every((r) => r.quantityNeeded === 0);
    if (!allSatisfied) {
      return {
        success: false,
        reason: 'INSUFFICIENT_STOCK_ALL_ORIGINS',
        message: 'Insufficient inventory across all authorized fulfillment locations combined',
        allocations: [],
        shipmentGroups: []
      };
    }

    // Build grouped shipment response
    const groupMap = new Map();
    splitAllocations.forEach((alloc) => {
      if (!groupMap.has(alloc.shipmentGroup)) {
        groupMap.set(alloc.shipmentGroup, {
          shipmentGroup: alloc.shipmentGroup,
          locationId: alloc.locationId,
          locationCode: alloc.locationCode,
          originCountry: alloc.originCountry,
          fulfillmentMode: alloc.fulfillmentMode,
          items: []
        });
      }
      groupMap.get(alloc.shipmentGroup).items.push(alloc);
    });

    return {
      success: true,
      strategy: 'split_shipment',
      shipmentGroups: Array.from(groupMap.values()),
      allocations: splitAllocations
    };
  }

  /**
   * Preview allocation for quote generation with zero persistent side effects.
   */
  async previewAllocation(params) {
    return this.allocate(params);
  }
}

module.exports = new InventoryAllocationService();

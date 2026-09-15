/**
 * @file InventoryService.js
 * @description Canonical Multi-Origin Inventory Management and Administration Service for Phase 6D-2.
 * Provides tenant-scoped location governance, per-location inventory positions, reasoned stock adjustments,
 * optimistic concurrency control, reservation administration, and read-only reconciliation reporting.
 */

const mongoose = require('mongoose');
const Product = require('../../models/Product');
const InventoryTransaction = require('../../models/InventoryTransaction');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryAllocationService = require('./InventoryAllocationService');
const InventoryReservationService = require('./InventoryReservationService');
const InventoryAvailabilityService = require('./InventoryAvailabilityService');
const AuditService = require('../AuditService');
const { CountryRegistry } = require('../../modules/commerce');
const { formatCsv } = require('../../utils/csvHelper');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

const { getRuntimeConfig } = require('../../config/runtime.config');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class InventoryService {
  /**
   * Determine if running in a deployed environment (staging or production).
   */
  isDeployedEnvironment() {
    try {
      const config = getRuntimeConfig();
      return Boolean(config?.isDeployed || config?.environment === 'production' || config?.environment === 'staging');
    } catch {
      const env = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
      return env === 'production' || env === 'staging';
    }
  }

  /**
   * Determine if an error is transient and safely retryable.
   */
  isTransientMongoError(error) {
    if (!error) return false;
    if (error.statusCode || error instanceof AppError) return false;
    return Boolean(
      error?.hasErrorLabel?.('TransientTransactionError')
      || error?.hasErrorLabel?.('UnknownTransactionCommitResult')
      || error?.name === 'VersionError'
      || error?.name === 'MongoServerError'
      || error?.code === 112 // WriteConflict
      || (typeof error?.message === 'string' && (
        error.message.includes('WriteConflict')
        || error.message.includes('No matching document found')
        || error.message.includes('version')
        || error.message.includes('parallel')
      ))
    );
  }

  /**
   * Run operations inside a Mongoose transaction with bounded transient conflict retries.
   */
  async runTransaction(work, maxRetries = 6) {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      let session = null;
      try {
        session = await mongoose.startSession();
        session.startTransaction();
      } catch (sessionErr) {
        session = null;
        if (this.isDeployedEnvironment()) {
          throw new AppError(
            'Database transactions are unavailable: ' + (sessionErr.message || 'Replica set session required in deployed environments'),
            503,
            ERROR_CODES.SERVICE_UNAVAILABLE || 'SERVICE_UNAVAILABLE'
          );
        }
      }

      if (!session) {
        if (this.isDeployedEnvironment()) {
          throw new AppError(
            'Database transactions are unavailable: Replica set session required in deployed environments',
            503,
            ERROR_CODES.SERVICE_UNAVAILABLE || 'SERVICE_UNAVAILABLE'
          );
        }
        try {
          return await work(null);
        } catch (error) {
          const isTransient = this.isTransientMongoError(error);
          if (isTransient && attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20) + 12 * attempt));
            continue;
          }
          throw error;
        }
      }

      try {
        const result = await work(session);
        await session.commitTransaction();
        return result;
      } catch (error) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }

        const isTransient = this.isTransientMongoError(error);
        if (isTransient && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20) + 12 * attempt));
          continue;
        }

        throw error;
      } finally {
        await session.endSession();
      }
    }
  }

  /**
   * Helper to ensure an active default location exists for a merchant scope.
   */
  async getOrCreateDefaultLocation(merchantScopeId = 'default', session = null) {
    let query = FulfillmentLocation.findOne({ merchantScopeId, isDefault: true, status: 'active' });
    if (session) query = query.session(session);
    let location = await query;

    if (!location) {
      let anyActiveQuery = FulfillmentLocation.findOne({ merchantScopeId, status: 'active' }).sort({ priority: 1 });
      if (session) anyActiveQuery = anyActiveQuery.session(session);
      location = await anyActiveQuery;
    }

    if (!location) {
      // Create bootstrap primary location for home market (PK)
      const bootstrap = new FulfillmentLocation({
        merchantScopeId,
        locationCode: 'WH-PRIMARY-01',
        displayName: 'Primary Warehouse',
        status: 'active',
        countryCode: 'PK',
        city: 'Lahore',
        timeZone: 'Asia/Karachi',
        priority: 10,
        supportedMarketCountries: ['PK', 'AE', 'SA', 'GB', 'US'],
        supportedServiceLevels: ['standard', 'express'],
        capabilities: ['local_delivery', 'cross_border'],
        returnCapabilities: ['accept_returns', 'inspection', 'restock'],
        isDefault: true
      });

      if (session) {
        await bootstrap.save({ session });
      } else {
        await bootstrap.save();
      }
      location = bootstrap;
    }

    return location;
  }

  // ==========================================
  // 1. FULFILLMENT LOCATION GOVERNANCE
  // ==========================================

  async getLocations({ merchantScopeId = 'default', status, country, page = 1, limit = 20 }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = { merchantScopeId };
    if (status && ['draft', 'active', 'suspended', 'retired'].includes(status)) {
      query.status = status;
    }
    if (country) {
      query.countryCode = String(country).trim().toUpperCase();
    }

    const [total, locations] = await Promise.all([
      FulfillmentLocation.countDocuments(query),
      FulfillmentLocation.find(query)
        .sort({ priority: 1, locationCode: 1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    return {
      data: locations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    };
  }

  async getLocationById(locationId, merchantScopeId = 'default') {
    if (!mongoose.isObjectIdOrHexString(locationId)) {
      throw new AppError('Invalid location ID', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    const location = await FulfillmentLocation.findOne({ _id: locationId, merchantScopeId });
    if (!location) {
      throw new AppError('Fulfillment location not found', 404, 'LOCATION_NOT_FOUND');
    }
    return location;
  }

  async createLocation({ locationData, actorId = null, req = null }) {
    if (!locationData || typeof locationData !== 'object') {
      throw new AppError('Location data is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const {
      merchantScopeId = 'default',
      locationCode,
      displayName,
      countryCode,
      subdivision,
      city,
      postalCode,
      addressLine1,
      addressLine2,
      timeZone,
      priority,
      supportedMarketCountries,
      supportedServiceLevels,
      capabilities,
      returnCapabilities,
      isDefault
    } = locationData;

    return this.runTransaction(async (session) => {
      // Check if locationCode already exists in merchant scope
      const existing = await FulfillmentLocation.findOne({
        merchantScopeId,
        locationCode: String(locationCode).trim().toUpperCase()
      }).session(session);

      if (existing) {
        throw new AppError(`Location code '${locationCode}' already exists for this merchant scope`, 409, 'LOCATION_CODE_EXISTS');
      }

      if (isDefault) {
        // Unset previous active default
        await FulfillmentLocation.updateMany(
          { merchantScopeId, isDefault: true },
          { $set: { isDefault: false } },
          { session }
        );
      }

      const location = new FulfillmentLocation({
        merchantScopeId,
        locationCode,
        displayName,
        status: locationData.status || 'active',
        countryCode,
        subdivision: subdivision || '',
        city,
        postalCode: postalCode || '',
        addressLine1: addressLine1 || '',
        addressLine2: addressLine2 || '',
        timeZone: timeZone || 'Asia/Karachi',
        priority: priority !== undefined ? Number(priority) : 100,
        supportedMarketCountries: Array.isArray(supportedMarketCountries) && supportedMarketCountries.length > 0
          ? supportedMarketCountries.map((c) => String(c).trim().toUpperCase())
          : [countryCode.trim().toUpperCase()],
        supportedServiceLevels: supportedServiceLevels || ['standard', 'express'],
        capabilities: capabilities || ['local_delivery', 'cross_border'],
        returnCapabilities: returnCapabilities || ['accept_returns', 'inspection', 'restock'],
        isDefault: Boolean(isDefault),
        createdBy: actorId,
        updatedBy: actorId
      });

      await location.save({ session });

      if (req) {
        await AuditService.log({
          requestId: req.requestId,
          userId: actorId,
          eventName: 'INVENTORY.LOCATION_CREATED',
          status: 'SUCCESS',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          metadata: {
            locationId: String(location._id),
            locationCode: location.locationCode,
            countryCode: location.countryCode,
            merchantScopeId
          }
        });
      }

      return location;
    });
  }

  async updateLocation({ locationId, updateData, actorId = null, req = null }) {
    if (!mongoose.isObjectIdOrHexString(locationId)) {
      throw new AppError('Invalid location ID', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return this.runTransaction(async (session) => {
      const location = await FulfillmentLocation.findById(locationId).session(session);
      if (!location) {
        throw new AppError('Fulfillment location not found', 404, 'LOCATION_NOT_FOUND');
      }

      if (location.status === 'retired' && updateData.status !== 'active') {
        throw new AppError('Retired locations cannot be modified', 409, 'LOCATION_RETIRED');
      }

      if (updateData.isDefault && !location.isDefault) {
        await FulfillmentLocation.updateMany(
          { merchantScopeId: location.merchantScopeId, isDefault: true },
          { $set: { isDefault: false } },
          { session }
        );
      }

      const allowedFields = [
        'displayName', 'status', 'subdivision', 'city', 'postalCode',
        'addressLine1', 'addressLine2', 'timeZone', 'priority',
        'supportedMarketCountries', 'supportedServiceLevels',
        'capabilities', 'returnCapabilities', 'isDefault'
      ];

      allowedFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          location[field] = updateData[field];
        }
      });

      location.lockVersion += 1;
      location.updatedBy = actorId;
      await location.save({ session });

      if (req) {
        await AuditService.log({
          requestId: req.requestId,
          userId: actorId,
          eventName: 'INVENTORY.LOCATION_UPDATED',
          status: 'SUCCESS',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          metadata: {
            locationId: String(location._id),
            locationCode: location.locationCode,
            status: location.status
          }
        });
      }

      return location;
    });
  }

  async updateLocationStatus({ locationId, status, actorId = null, req = null }) {
    if (!['draft', 'active', 'suspended', 'retired'].includes(status)) {
      throw new AppError(`Invalid status '${status}'. Must be draft, active, suspended, or retired`, 400, ERROR_CODES.VALIDATION_ERROR);
    }
    return this.updateLocation({ locationId, updateData: { status }, actorId, req });
  }

  // ==========================================
  // 2. INVENTORY POSITIONS & CONTROLS
  // ==========================================

  async getPositions({
    merchantScopeId = 'default',
    locationId,
    productId,
    sku,
    search,
    stockStatus = 'all',
    page = 1,
    limit = 20
  }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = { merchantScopeId };
    if (locationId && mongoose.isObjectIdOrHexString(locationId)) {
      query.locationId = locationId;
    }
    if (productId && mongoose.isObjectIdOrHexString(productId)) {
      query.productId = productId;
    }
    if (sku && typeof sku === 'string') {
      query.canonicalSku = sku.trim().toUpperCase();
    }
    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = escapeRegex(search.trim());
      query.$or = [
        { canonicalSku: { $regex: sanitized, $options: 'i' } },
        { locationCode: { $regex: sanitized, $options: 'i' } }
      ];
    }

    if (stockStatus === 'out-of-stock') {
      query.$expr = {
        $lte: [
          { $subtract: [{ $subtract: [{ $subtract: ['$onHand', '$reserved'] }, '$unavailable'] }, '$safetyStock'] },
          0
        ]
      };
    } else if (stockStatus === 'low-stock') {
      query.$expr = {
        $and: [
          {
            $gt: [
              { $subtract: [{ $subtract: [{ $subtract: ['$onHand', '$reserved'] }, '$unavailable'] }, '$safetyStock'] },
              0
            ]
          },
          {
            $lte: [
              { $subtract: [{ $subtract: [{ $subtract: ['$onHand', '$reserved'] }, '$unavailable'] }, '$safetyStock'] },
              '$reorderPoint'
            ]
          }
        ]
      };
    } else if (stockStatus === 'in-stock') {
      query.$expr = {
        $gt: [
          { $subtract: [{ $subtract: [{ $subtract: ['$onHand', '$reserved'] }, '$unavailable'] }, '$safetyStock'] },
          '$reorderPoint'
        ]
      };
    }

    const [total, positions] = await Promise.all([
      InventoryPosition.countDocuments(query),
      InventoryPosition.find(query)
        .populate('productId', 'name sku primaryImage status isActive lowStockThreshold')
        .populate('locationId', 'locationCode displayName countryCode city status')
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    const formattedPositions = positions.map((p) => {
      const atp = p.calculateATP();
      return {
        _id: String(p._id),
        id: String(p._id),
        merchantScopeId: p.merchantScopeId,
        location: p.locationId ? {
          id: String(p.locationId._id),
          locationCode: p.locationId.locationCode,
          displayName: p.locationId.displayName,
          countryCode: p.locationId.countryCode,
          city: p.locationId.city
        } : { locationCode: p.locationCode },
        product: p.productId ? {
          id: String(p.productId._id),
          name: p.productId.name,
          sku: p.productId.sku,
          image: p.productId.primaryImage
        } : null,
        variantId: p.variantId ? String(p.variantId) : null,
        scopeType: p.scopeType,
        scopeKey: p.scopeKey,
        canonicalSku: p.canonicalSku,
        onHand: p.onHand,
        reserved: p.reserved,
        unavailable: p.unavailable,
        safetyStock: p.safetyStock,
        reorderPoint: p.reorderPoint,
        allowBackorder: p.allowBackorder,
        backorderLimit: p.backorderLimit,
        atp,
        lockVersion: p.lockVersion,
        lastUpdated: p.updatedAt
      };
    });

    return {
      data: formattedPositions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    };
  }

  async getPositionById(positionId, merchantScopeId = 'default') {
    if (!mongoose.isObjectIdOrHexString(positionId)) {
      throw new AppError('Invalid position ID', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    const position = await InventoryPosition.findOne({ _id: positionId, merchantScopeId })
      .populate('productId', 'name sku primaryImage variants')
      .populate('locationId', 'locationCode displayName countryCode city');

    if (!position) {
      throw new AppError('Inventory position not found', 404, 'INVENTORY_POSITION_NOT_FOUND');
    }
    return position;
  }

  async updatePositionControls({
    positionId,
    safetyStock,
    reorderPoint,
    allowBackorder,
    backorderLimit,
    actorId = null,
    req = null
  }) {
    if (!mongoose.isObjectIdOrHexString(positionId)) {
      throw new AppError('Invalid position ID', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    return this.runTransaction(async (session) => {
      const position = await InventoryPosition.findById(positionId).session(session);
      if (!position) {
        throw new AppError('Inventory position not found', 404, 'INVENTORY_POSITION_NOT_FOUND');
      }

      if (safetyStock !== undefined) {
        const num = Number(safetyStock);
        if (!Number.isInteger(num) || num < 0) {
          throw new AppError('safetyStock must be a non-negative integer', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        position.safetyStock = num;
      }

      if (reorderPoint !== undefined) {
        const num = Number(reorderPoint);
        if (!Number.isInteger(num) || num < 0) {
          throw new AppError('reorderPoint must be a non-negative integer', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        position.reorderPoint = num;
      }

      if (allowBackorder !== undefined) {
        position.allowBackorder = Boolean(allowBackorder);
      }

      if (backorderLimit !== undefined) {
        const num = Number(backorderLimit);
        if (!Number.isInteger(num) || num < 0) {
          throw new AppError('backorderLimit must be a non-negative integer', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        position.backorderLimit = num;
      }

      position.lockVersion += 1;
      await position.save({ session });

      if (req) {
        await AuditService.log({
          requestId: req.requestId,
          userId: actorId,
          eventName: 'INVENTORY.POSITION_CONTROLS_UPDATED',
          status: 'SUCCESS',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          metadata: {
            positionId: String(position._id),
            safetyStock: position.safetyStock,
            reorderPoint: position.reorderPoint,
            allowBackorder: position.allowBackorder
          }
        });
      }

      return position;
    });
  }

  // ==========================================
  // 3. REASONED STOCK ADJUSTMENT
  // ==========================================

  /**
   * Adjust inventory stock authoritatively with multi-origin location support,
   * optimistic locking, immutable ledger recording, and legacy transaction recording.
   */
  async adjustStock({
    productId,
    variantId = null,
    locationId = null,
    type,
    quantity,
    reason,
    reference = '',
    operationKey,
    actorId,
    req = null
  }) {
    if (!mongoose.isObjectIdOrHexString(productId)) {
      throw new AppError('Invalid product identifier', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    if (variantId && !mongoose.isObjectIdOrHexString(variantId)) {
      throw new AppError('Invalid variant identifier', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    if (!['in', 'out', 'adjustment'].includes(type)) {
      throw new AppError('Adjustment type must be in, out, or adjustment', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    if (!Number.isInteger(quantity) || (type !== 'adjustment' && quantity < 1) || (type === 'adjustment' && quantity < 0)) {
      throw new AppError('Invalid quantity for adjustment type', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new AppError('Reason is required for inventory adjustment', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (!operationKey || typeof operationKey !== 'string' || !UUID_REGEX.test(operationKey.trim())) {
      throw new AppError('A valid operationKey (UUID) is required for inventory adjustments', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const trimmedKey = operationKey.trim();

    // 1. Idempotency Check: check both InventoryLedger and InventoryTransaction
    const existingTx = await InventoryTransaction.findOne({ operationKey: trimmedKey });
    if (existingTx) {
      const product = await Product.findById(productId);
      return {
        transaction: existingTx,
        product: {
          id: String(productId),
          name: product?.name || '',
          variantId: variantId || null,
          previousStock: existingTx.previousStock,
          newStock: existingTx.newStock,
          rootStock: product?.stock ?? existingTx.newStock
        },
        idempotentReplay: true
      };
    }

    let transactionDoc = null;
    let modifiedProduct = null;
    let previousStock = 0;
    let newStock = 0;
    let targetLocation = null;

    try {
      await this.runTransaction(async (session) => {
        // Double-check idempotency within transaction
        if (session) {
          const replayCheck = await InventoryTransaction.findOne({ operationKey: trimmedKey }).session(session);
          if (replayCheck) {
            transactionDoc = replayCheck;
            return;
          }
        }

        // Resolve Product
        const productQuery = Product.findById(productId);
        if (session) productQuery.session(session);
        const product = await productQuery;

        if (!product) {
          throw new AppError('Product not found', 404, ERROR_CODES.PRODUCT_NOT_FOUND);
        }

        const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
        let targetVariant = null;
        let canonicalSku = product.sku || 'SKU-UNSET';

        if (hasVariants) {
          if (!variantId) {
            throw new AppError('Variant ID is required for variable product adjustment', 400, ERROR_CODES.VALIDATION_ERROR);
          }
          targetVariant = product.variants.id(variantId);
          if (!targetVariant) {
            throw new AppError('Product variant not found', 404, ERROR_CODES.ORDER_VARIANT_NOT_FOUND);
          }
          canonicalSku = targetVariant.sku || canonicalSku;
        } else {
          if (variantId) {
            throw new AppError('Variant ID cannot be specified for simple products', 400, ERROR_CODES.VALIDATION_ERROR);
          }
        }

        // Resolve or create Fulfillment Location
        if (locationId && mongoose.isObjectIdOrHexString(locationId)) {
          let locQuery = FulfillmentLocation.findById(locationId);
          if (session) locQuery = locQuery.session(session);
          targetLocation = await locQuery;
          if (!targetLocation) {
            throw new AppError('Specified fulfillment location was not found', 404, 'LOCATION_NOT_FOUND');
          }
        } else {
          targetLocation = await this.getOrCreateDefaultLocation('default', session);
        }

        const scopeType = hasVariants ? 'variant' : 'product';
        const scopeKey = hasVariants ? String(variantId) : 'product';

        // Find or create InventoryPosition
        let posQuery = InventoryPosition.findOne({
          merchantScopeId: targetLocation.merchantScopeId,
          locationId: targetLocation._id,
          productId: product._id,
          scopeType,
          scopeKey
        });
        if (session) posQuery = posQuery.session(session);
        let position = await posQuery;

        if (!position) {
          position = new InventoryPosition({
            merchantScopeId: targetLocation.merchantScopeId,
            locationId: targetLocation._id,
            locationCode: targetLocation.locationCode,
            productId: product._id,
            variantId: variantId || null,
            scopeType,
            scopeKey,
            canonicalSku,
            onHand: 0,
            reserved: 0,
            unavailable: 0,
            safetyStock: 0,
            reorderPoint: typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : 10
          });
        }

        previousStock = position.onHand;
        if (type === 'in') {
          newStock = previousStock + quantity;
        } else if (type === 'out') {
          newStock = previousStock - quantity;
        } else {
          newStock = quantity;
        }

        if (newStock < 0) {
          throw new AppError('Cannot reduce stock below zero', 409, ERROR_CODES.INVENTORY_INSUFFICIENT);
        }

        const beforeAtp = position.calculateATP();
        position.onHand = newStock;
        position.lockVersion += 1;
        position.lastLedgerSequence = trimmedKey;

        if (session) {
          await position.save({ session });
        } else {
          await position.save();
        }

        // Synchronize legacy Product model stock for backward compatibility
        if (hasVariants) {
          targetVariant.stock = newStock;
          product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        } else {
          product.stock = newStock;
        }

        if (session) {
          await product.save({ session });
        } else {
          await product.save();
        }

        const delta = Math.abs(newStock - previousStock);

        // Record immutable InventoryLedger entry
        const ledgerEntry = new InventoryLedger({
          merchantScopeId: targetLocation.merchantScopeId,
          locationId: targetLocation._id,
          locationCode: targetLocation.locationCode,
          productId: product._id,
          variantId: variantId || null,
          canonicalSku,
          movementType: 'ADMIN_ADJUSTMENT',
          quantityDelta: type === 'out' ? -delta : (type === 'in' ? delta : (newStock - previousStock)),
          reservationDelta: 0,
          beforeSnapshot: {
            onHand: previousStock,
            reserved: position.reserved,
            unavailable: position.unavailable,
            safetyStock: position.safetyStock,
            atp: beforeAtp
          },
          afterSnapshot: {
            onHand: newStock,
            reserved: position.reserved,
            unavailable: position.unavailable,
            safetyStock: position.safetyStock,
            atp: position.calculateATP()
          },
          reasonCode: reason.trim().slice(0, 200),
          sourceType: 'adjustment',
          sourceId: trimmedKey,
          idempotencyKey: trimmedKey,
          actorType: 'admin',
          actorId,
          correlationId: trimmedKey
        });

        if (session) {
          await ledgerEntry.save({ session });
        } else {
          await ledgerEntry.save();
        }

        // Record legacy InventoryTransaction entry
        const createdTx = new InventoryTransaction({
          product: productId,
          variantId: variantId || null,
          operationKey: trimmedKey,
          type,
          quantity: delta,
          previousStock,
          newStock,
          reason: reason.trim().slice(0, 500),
          reference: reference ? String(reference).trim().slice(0, 200) : '',
          performedBy: actorId,
          metadata: {
            productName: product.name,
            sku: canonicalSku,
            locationCode: targetLocation.locationCode
          }
        });

        if (session) {
          await createdTx.save({ session });
        } else {
          await createdTx.save();
        }

        transactionDoc = createdTx;
        modifiedProduct = product;
      });
    } catch (error) {
      if (error?.code === 11000 && (String(error?.message).includes('operationKey') || String(error?.message).includes('idempotencyKey'))) {
        let replay = await InventoryTransaction.findOne({ operationKey: trimmedKey });
        if (!replay) {
          await new Promise((r) => setTimeout(r, 60));
          replay = await InventoryTransaction.findOne({ operationKey: trimmedKey });
        }
        if (replay) {
          const product = await Product.findById(productId);
          return {
            transaction: replay,
            product: {
              id: String(productId),
              name: product?.name || '',
              variantId: variantId || null,
              previousStock: replay.previousStock,
              newStock: replay.newStock,
              rootStock: product?.stock ?? replay.newStock
            },
            idempotentReplay: true
          };
        }
      }
      throw error;
    }

    if (req) {
      await AuditService.log({
        requestId: req.requestId,
        userId: actorId,
        eventName: 'INVENTORY.STOCK_ADJUSTED',
        status: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: {
          productId,
          variantId: variantId || null,
          locationId: String(targetLocation?._id || ''),
          locationCode: targetLocation?.locationCode || '',
          type,
          previousStock,
          newStock,
          operationKey: trimmedKey,
          reason: reason.trim()
        }
      });
    }

    return {
      transaction: transactionDoc,
      product: {
        id: String(productId),
        name: modifiedProduct?.name || '',
        variantId: variantId || null,
        previousStock,
        newStock,
        rootStock: modifiedProduct?.stock ?? newStock
      },
      idempotentReplay: false
    };
  }

  // ==========================================
  // 4. RESERVATIONS ADMINISTRATION
  // ==========================================

  async getReservations({ merchantScopeId = 'default', status, orderId, page = 1, limit = 20 }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = { merchantScopeId };
    if (status && Object.values(InventoryReservation.STATUSES).includes(status)) {
      query.status = status;
    }
    if (orderId) {
      query.orderId = String(orderId).trim();
    }

    const [total, reservations] = await Promise.all([
      InventoryReservation.countDocuments(query),
      InventoryReservation.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    return {
      data: reservations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      }
    };
  }

  async getReservationById(reservationId, merchantScopeId = 'default') {
    if (!mongoose.isObjectIdOrHexString(reservationId)) {
      throw new AppError('Invalid reservation ID', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    const reservation = await InventoryReservation.findOne({ _id: reservationId, merchantScopeId });
    if (!reservation) {
      throw new AppError('Inventory reservation not found', 404, 'RESERVATION_NOT_FOUND');
    }
    return reservation;
  }

  async releaseReservationAdmin({ reservationId, reason = 'ADMIN_MANUAL_RELEASE', actorId = null, req = null }) {
    return this.runTransaction(async (session) => {
      const result = await InventoryReservationService.releaseReservation({
        reservationId,
        releaseReason: reason,
        session,
        userId: actorId
      });

      if (req) {
        await AuditService.log({
          requestId: req.requestId,
          userId: actorId,
          eventName: 'INVENTORY.RESERVATION_RELEASED',
          status: 'SUCCESS',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          metadata: {
            reservationId: String(reservationId),
            reason
          }
        });
      }

      return result;
    });
  }

  // ==========================================
  // 5. ALLOCATION PREVIEW & RECONCILIATION
  // ==========================================

  async previewAllocation(params) {
    return InventoryAllocationService.previewAllocation(params);
  }

  async getReconciliationReport({ merchantScopeId = 'default' } = {}) {
    const locations = await FulfillmentLocation.find({ merchantScopeId });
    const positions = await InventoryPosition.find({ merchantScopeId });
    const activeReservations = await InventoryReservation.find({
      merchantScopeId,
      status: { $in: ['pending', 'confirmed'] }
    });

    let totalPositions = positions.length;
    let totalOnHand = 0;
    let totalReserved = 0;
    let totalUnavailable = 0;
    let totalSafetyStock = 0;
    let totalAtp = 0;

    positions.forEach((p) => {
      totalOnHand += p.onHand;
      totalReserved += p.reserved;
      totalUnavailable += p.unavailable;
      totalSafetyStock += p.safetyStock;
      totalAtp += p.calculateATP();
    });

    // Check active reservation quantity sum vs position reserved sum
    let expectedReservedSum = 0;
    activeReservations.forEach((r) => {
      r.allocations.forEach((a) => {
        expectedReservedSum += a.quantity;
      });
    });

    const isReservedConsistent = totalReserved >= expectedReservedSum;

    return {
      merchantScopeId,
      locationsCount: locations.length,
      positionsCount: totalPositions,
      aggregateCounters: {
        totalOnHand,
        totalReserved,
        totalUnavailable,
        totalSafetyStock,
        totalAtp
      },
      reservations: {
        activeCount: activeReservations.length,
        expectedReservedUnits: expectedReservedSum,
        actualReservedUnits: totalReserved,
        isConsistent: isReservedConsistent
      },
      status: isReservedConsistent ? 'HEALTHY' : 'MISMATCH_DETECTED'
    };
  }

  // ==========================================
  // 6. LEGACY COMPATIBILITY METHODS
  // ==========================================

  async getInventoryList(params) {
    const pageNum = Math.max(1, parseInt(params.page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 15));
    const skip = (pageNum - 1) * limitNum;

    const query = { isDeleted: { $ne: true } };

    if (params.category && mongoose.isObjectIdOrHexString(params.category)) {
      query.category = params.category;
    }

    if (params.search && typeof params.search === 'string' && params.search.trim()) {
      const sanitized = escapeRegex(params.search.trim().slice(0, 100));
      query.$or = [
        { name: { $regex: sanitized, $options: 'i' } },
        { sku: { $regex: sanitized, $options: 'i' } },
        { 'variants.sku': { $regex: sanitized, $options: 'i' } }
      ];
    }

    if (params.stockStatus === 'out-of-stock') {
      query.stock = { $lte: 0 };
    } else if (params.stockStatus === 'low-stock') {
      query.$expr = { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] };
      query.stock = { $gt: 0 };
    } else if (params.stockStatus === 'in-stock') {
      query.$expr = { $gt: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] };
    }

    const sortMap = {
      'stock-asc': { stock: 1, _id: 1 },
      'stock-desc': { stock: -1, _id: -1 },
      'name-asc': { name: 1, _id: 1 },
      'name-desc': { name: -1, _id: -1 },
      'updatedAt-desc': { updatedAt: -1, _id: -1 }
    };
    const mongoSort = sortMap[params.sortBy] || { stock: 1, _id: 1 };

    const [total, products, allCatalogProducts] = await Promise.all([
      Product.countDocuments(query),
      Product.find(query)
        .populate('category', 'name')
        .populate('brand', 'name')
        .sort(mongoSort)
        .skip(skip)
        .limit(limitNum),
      Product.find({ isDeleted: { $ne: true } }, 'stock lowStockThreshold variants.sku variants.stock variants._id')
    ]);

    let totalSellableSkus = 0;
    let totalPhysicalUnits = 0;
    let inStockSkus = 0;
    let lowStockSkus = 0;
    let outOfStockSkus = 0;

    allCatalogProducts.forEach((p) => {
      const threshold = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 10;
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        totalSellableSkus += p.variants.length;
        p.variants.forEach((v) => {
          const vStock = v.stock || 0;
          totalPhysicalUnits += vStock;
          if (vStock <= 0) outOfStockSkus += 1;
          else if (vStock <= threshold) lowStockSkus += 1;
          else inStockSkus += 1;
        });
      } else {
        totalSellableSkus += 1;
        const pStock = p.stock || 0;
        totalPhysicalUnits += pStock;
        if (pStock <= 0) outOfStockSkus += 1;
        else if (pStock <= threshold) lowStockSkus += 1;
        else inStockSkus += 1;
      }
    });

    const inventoryData = products.map((p) => {
      const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
      return {
        _id: String(p._id),
        id: String(p._id),
        product: {
          _id: String(p._id),
          name: p.name,
          sku: p.sku || 'N/A',
          images: p.images || [],
          price: p.price ?? 0,
          category: p.category ? { id: String(p.category._id || p.category), name: p.category.name || 'Uncategorized' } : null
        },
        stock: p.stock,
        lowStockThreshold: typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 10,
        hasVariants,
        variants: hasVariants
          ? p.variants.map((v) => ({
            _id: String(v._id),
            sku: v.sku || 'N/A',
            stock: v.stock ?? 0,
            price: v.price ?? p.price ?? 0,
            attributes: v.attributes || []
          }))
          : [],
        lastUpdated: p.updatedAt
      };
    });

    const pages = Math.max(1, Math.ceil(total / limitNum));

    return {
      data: inventoryData,
      summary: {
        global: {
          totalProducts: allCatalogProducts.length,
          totalSellableSkus,
          totalPhysicalUnits,
          inStockSkus,
          lowStockSkus,
          outOfStockSkus
        }
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages,
        hasNext: pageNum < pages,
        hasPrev: pageNum > 1
      }
    };
  }

  async getStockHistory({ productId, variantId, type, page = 1, limit = 20 }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (productId && mongoose.isObjectIdOrHexString(productId)) {
      query.product = productId;
    }
    if (variantId && mongoose.isObjectIdOrHexString(variantId)) {
      query.variantId = variantId;
    }
    if (type && ['in', 'out', 'adjustment', 'return', 'damage', 'sale'].includes(type)) {
      query.type = type;
    }

    const [total, transactions] = await Promise.all([
      InventoryTransaction.countDocuments(query),
      InventoryTransaction.find(query)
        .populate('product', 'name sku images')
        .populate('performedBy', 'fullName email')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    const pages = Math.max(1, Math.ceil(total / limitNum));

    return {
      data: transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages,
        hasNext: pageNum < pages,
        hasPrev: pageNum > 1
      }
    };
  }

  async exportInventoryCsv({ search = '', category = '', stockStatus = 'all' }) {
    const MAX_EXPORT_LIMIT = 5000;

    const query = { isDeleted: { $ne: true } };
    if (category && mongoose.isObjectIdOrHexString(category)) {
      query.category = category;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { name: { $regex: sanitized, $options: 'i' } },
        { sku: { $regex: sanitized, $options: 'i' } },
        { 'variants.sku': { $regex: sanitized, $options: 'i' } }
      ];
    }
    if (stockStatus === 'out-of-stock') {
      query.stock = { $lte: 0 };
    } else if (stockStatus === 'low-stock') {
      query.$expr = { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] };
      query.stock = { $gt: 0 };
    } else if (stockStatus === 'in-stock') {
      query.$expr = { $gt: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] };
    }

    const products = await Product.find(query)
      .populate('category', 'name')
      .sort({ name: 1, _id: 1 });

    const rows = [];
    products.forEach((p) => {
      const threshold = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 10;
      const categoryName = p.category?.name || 'Uncategorized';

      if (Array.isArray(p.variants) && p.variants.length > 0) {
        p.variants.forEach((v) => {
          const vStock = v.stock ?? 0;
          const statusText = vStock <= 0 ? 'Out of Stock' : vStock <= threshold ? 'Low Stock' : 'In Stock';
          const attrStr = Array.isArray(v.attributes)
            ? v.attributes.map((a) => `${a.name}: ${a.value}`).join('; ')
            : '';

          rows.push([
            String(p._id),
            p.name || '',
            'Variant',
            v.sku || p.sku || '',
            attrStr,
            vStock,
            threshold,
            statusText,
            categoryName,
            p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : ''
          ]);
        });
      } else {
        const pStock = p.stock ?? 0;
        const statusText = pStock <= 0 ? 'Out of Stock' : pStock <= threshold ? 'Low Stock' : 'In Stock';

        rows.push([
          String(p._id),
          p.name || '',
          'Simple',
          p.sku || '',
          'N/A',
          pStock,
          threshold,
          statusText,
          categoryName,
          p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : ''
        ]);
      }
    });

    if (rows.length > MAX_EXPORT_LIMIT) {
      throw new AppError(
        `Export matches ${rows.length} sellable SKUs, which exceeds the maximum limit of ${MAX_EXPORT_LIMIT}. Please narrow your filter.`,
        400,
        'EXPORT_LIMIT_EXCEEDED'
      );
    }

    const headers = [
      'Product ID',
      'Product Name',
      'SKU Type',
      'SKU',
      'Attributes',
      'Current Stock',
      'Low Stock Threshold',
      'Stock Status',
      'Category',
      'Last Updated'
    ];

    return {
      csvData: formatCsv(headers, rows),
      rowCount: rows.length
    };
  }
}

module.exports = new InventoryService();

/**
 * @file inventoryController.js
 * @description Admin inventory controller for Phase 6D-2 multi-origin inventory governance.
 * Exposes location management, inventory positions, reasoned stock adjustments, position controls,
 * reservation administration, zero-side-effect allocation preview, and reconciliation reports.
 */

const InventoryService = require('../services/inventory/InventoryService');
const {
  sanitizeFilename,
  safeContentDisposition
} = require('../utils/csvHelper');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');

// ==========================================
// 1. FULFILLMENT LOCATIONS
// ==========================================

// @desc    Get fulfillment locations
// @route   GET /api/inventory/locations
// @access  Private (inventory, manager, admin, super_admin)
exports.getLocations = async (req, res, next) => {
  try {
    const { status, country, page = 1, limit = 20 } = req.query;
    const merchantScopeId = req.merchantScopeId || req.query.merchantScopeId || 'default';

    const result = await InventoryService.getLocations({
      merchantScopeId,
      status,
      country,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get single fulfillment location
// @route   GET /api/inventory/locations/:id
// @access  Private (inventory, manager, admin, super_admin)
exports.getLocationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const merchantScopeId = req.merchantScopeId || req.query.merchantScopeId || 'default';

    const location = await InventoryService.getLocationById(id, merchantScopeId);

    return res.status(200).json({
      success: true,
      data: location
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Create new fulfillment location
// @route   POST /api/inventory/locations
// @access  Private (admin, super_admin)
exports.createLocation = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?._id || req.auth?.userId;
    const locationData = {
      ...req.body,
      merchantScopeId: req.merchantScopeId || req.body.merchantScopeId || 'default'
    };

    const location = await InventoryService.createLocation({
      locationData,
      actorId,
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Fulfillment location created successfully',
      data: location
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Update fulfillment location
// @route   PUT /api/inventory/locations/:id
// @access  Private (admin, super_admin)
exports.updateLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const actorId = req.user?.id || req.user?._id || req.auth?.userId;

    const location = await InventoryService.updateLocation({
      locationId: id,
      updateData: req.body,
      actorId,
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Fulfillment location updated successfully',
      data: location
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Update fulfillment location lifecycle status (draft/active/suspended/retired)
// @route   POST /api/inventory/locations/:id/status
// @access  Private (admin, super_admin)
exports.updateLocationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const actorId = req.user?.id || req.user?._id || req.auth?.userId;

    const location = await InventoryService.updateLocationStatus({
      locationId: id,
      status,
      actorId,
      req
    });

    return res.status(200).json({
      success: true,
      message: `Fulfillment location status updated to '${status}'`,
      data: location
    });
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// 2. INVENTORY POSITIONS & CONTROLS
// ==========================================

// @desc    Get inventory positions
// @route   GET /api/inventory/positions
// @access  Private (inventory, manager, admin, super_admin)
exports.getPositions = async (req, res, next) => {
  try {
    const {
      locationId,
      productId,
      sku,
      search,
      stockStatus = 'all',
      page = 1,
      limit = 20
    } = req.query;
    const merchantScopeId = req.merchantScopeId || req.query.merchantScopeId || 'default';

    const result = await InventoryService.getPositions({
      merchantScopeId,
      locationId,
      productId,
      sku,
      search,
      stockStatus,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get single inventory position
// @route   GET /api/inventory/positions/:id
// @access  Private (inventory, manager, admin, super_admin)
exports.getPositionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const merchantScopeId = req.merchantScopeId || req.query.merchantScopeId || 'default';

    const position = await InventoryService.getPositionById(id, merchantScopeId);

    return res.status(200).json({
      success: true,
      data: position
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Update position safety stock, reorder point, or backorder controls
// @route   PUT /api/inventory/positions/:id/controls
// @access  Private (admin, super_admin)
exports.updatePositionControls = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { safetyStock, reorderPoint, allowBackorder, backorderLimit } = req.body;
    const actorId = req.user?.id || req.user?._id || req.auth?.userId;

    const position = await InventoryService.updatePositionControls({
      positionId: id,
      safetyStock,
      reorderPoint,
      allowBackorder,
      backorderLimit,
      actorId,
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Position inventory controls updated successfully',
      data: position
    });
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// 3. STOCK ADJUSTMENT & HISTORY
// ==========================================

// @desc    Adjust product or variant stock authoritatively with concurrency and idempotency
// @route   POST /api/inventory/adjust
// @access  Private (inventory, manager, admin, super_admin)
exports.adjustStock = async (req, res, next) => {
  try {
    const {
      productId,
      variantId,
      locationId,
      quantity,
      type,
      reason,
      reference,
      operationKey
    } = req.body;

    const actorId = req.user?.id || req.user?._id || req.auth?.userId;

    const result = await InventoryService.adjustStock({
      productId,
      variantId,
      locationId,
      type,
      quantity: Number(quantity),
      reason,
      reference,
      operationKey,
      actorId,
      req
    });

    return res.status(200).json({
      success: true,
      message: result.idempotentReplay
        ? 'Idempotent replay: previous stock adjustment retrieved'
        : 'Stock adjusted successfully',
      data: {
        transaction: result.transaction,
        product: result.product,
        idempotentReplay: result.idempotentReplay
      }
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get stock history
// @route   GET /api/inventory/history/:productId?
// @access  Private (inventory, manager, admin, super_admin)
exports.getStockHistory = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { variantId, type, page = 1, limit = 20 } = req.query;

    const result = await InventoryService.getStockHistory({
      productId: productId || req.query.productId,
      variantId,
      type,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// 4. RESERVATIONS & ALLOCATION PREVIEW
// ==========================================

// @desc    Get inventory reservations list
// @route   GET /api/inventory/reservations
// @access  Private (inventory, manager, admin, super_admin)
exports.getReservations = async (req, res, next) => {
  try {
    const { status, orderId, page = 1, limit = 20 } = req.query;
    const merchantScopeId = req.merchantScopeId || req.query.merchantScopeId || 'default';

    const result = await InventoryService.getReservations({
      merchantScopeId,
      status,
      orderId,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get single reservation by ID
// @route   GET /api/inventory/reservations/:id
// @access  Private (inventory, manager, admin, super_admin)
exports.getReservationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const merchantScopeId = req.merchantScopeId || req.query.merchantScopeId || 'default';

    const reservation = await InventoryService.getReservationById(id, merchantScopeId);

    return res.status(200).json({
      success: true,
      data: reservation
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Manually release an eligible reservation
// @route   POST /api/inventory/reservations/:id/release
// @access  Private (admin, super_admin)
exports.releaseReservation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason = 'ADMIN_MANUAL_RELEASE' } = req.body;
    const actorId = req.user?.id || req.user?._id || req.auth?.userId;

    const result = await InventoryService.releaseReservationAdmin({
      reservationId: id,
      reason,
      actorId,
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Reservation released successfully',
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Preview allocation with zero side effects
// @route   POST /api/inventory/allocation/preview
// @access  Private (inventory, manager, admin, super_admin)
exports.previewAllocation = async (req, res, next) => {
  try {
    const {
      items,
      destinationCountry,
      serviceLevel = 'standard',
      allowSplit = false
    } = req.body;
    const merchantScopeId = req.merchantScopeId || req.body.merchantScopeId || 'default';

    const result = await InventoryService.previewAllocation({
      items,
      destinationCountry,
      merchantScopeId,
      serviceLevel,
      allowSplit
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get inventory reconciliation readiness report
// @route   GET /api/inventory/reconciliation
// @access  Private (admin, super_admin)
exports.getReconciliationReport = async (req, res, next) => {
  try {
    const merchantScopeId = req.merchantScopeId || req.query.merchantScopeId || 'default';
    const report = await InventoryService.getReconciliationReport({ merchantScopeId });

    return res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    return next(error);
  }
};

// ==========================================
// 5. LEGACY KPI / EXPORT COMPATIBILITY
// ==========================================

// @desc    Get legacy inventory list
// @route   GET /api/inventory
// @access  Private (inventory, manager, admin, super_admin)
exports.getInventory = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 15,
      search = '',
      category = '',
      stockStatus = 'all',
      sortBy = 'stock-asc'
    } = req.query;

    const result = await InventoryService.getInventoryList({
      page,
      limit,
      search,
      category,
      stockStatus,
      sortBy
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      summary: result.summary,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Get inventory statistics
// @route   GET /api/inventory/stats
// @access  Private (inventory, manager, admin, super_admin)
exports.getInventoryStats = async (req, res, next) => {
  try {
    const allProducts = await Product.find({ isDeleted: { $ne: true } }, 'stock lowStockThreshold variants.stock variants._id');

    let totalSellableSkus = 0;
    let totalPhysicalUnits = 0;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;

    allProducts.forEach((p) => {
      const threshold = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 10;
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        totalSellableSkus += p.variants.length;
        p.variants.forEach((v) => {
          const vStock = v.stock || 0;
          totalPhysicalUnits += vStock;
          if (vStock <= 0) outOfStock += 1;
          else if (vStock <= threshold) lowStock += 1;
          else inStock += 1;
        });
      } else {
        totalSellableSkus += 1;
        const pStock = p.stock || 0;
        totalPhysicalUnits += pStock;
        if (pStock <= 0) outOfStock += 1;
        else if (pStock <= threshold) lowStock += 1;
        else inStock += 1;
      }
    });

    const totalTransactions = await InventoryTransaction.countDocuments();
    const todayTransactions = await InventoryTransaction.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });

    return res.status(200).json({
      success: true,
      data: {
        totalProducts: allProducts.length,
        totalSellableSkus,
        totalStock: totalPhysicalUnits,
        totalPhysicalUnits,
        inStock,
        lowStock,
        outOfStock,
        totalTransactions,
        todayTransactions
      }
    });
  } catch (error) {
    return next(error);
  }
};

// @desc    Export inventory to CSV
// @route   GET /api/inventory/export
// @access  Private (inventory, manager, admin, super_admin)
exports.exportInventory = async (req, res, next) => {
  try {
    const { search = '', category = '', stockStatus = 'all' } = req.query;

    const { csvData, rowCount } = await InventoryService.exportInventoryCsv({
      search,
      category,
      stockStatus
    });

    const filename = sanitizeFilename(`inventory_export_${new Date().toISOString().slice(0, 10)}.csv`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', safeContentDisposition(filename));
    res.setHeader('X-Export-Row-Count', String(rowCount));
    return res.status(200).send(csvData);
  } catch (error) {
    return next(error);
  }
};

// Legacy aliases
exports.getInventoryOverview = exports.getInventoryStats;
exports.getLowStock = exports.getInventory;
exports.bulkStockUpdate = async (req, res, next) => {
  return res.status(400).json({
    success: false,
    message: 'Bulk stock update is disabled. Please use single authoritative stock adjustment.'
  });
};

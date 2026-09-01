const InventoryService = require('../services/inventory/InventoryService');
const {
  sanitizeFilename,
  safeContentDisposition
} = require('../utils/csvHelper');
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');

// @desc    Get inventory list with server-side pagination, search, category, stock-status filter, and truthful KPI summaries
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

// @desc    Adjust product or variant stock authoritatively with concurrency and idempotency
// @route   POST /api/inventory/adjust
// @access  Private (inventory, manager, admin, super_admin)
exports.adjustStock = async (req, res, next) => {
  try {
    const {
      productId,
      variantId,
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

// @desc    Export inventory to CSV (one row per sellable SKU, bounded 5,000 rows)
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

// Legacy alias methods maintained for compatibility
exports.getInventoryOverview = exports.getInventoryStats;
exports.getLowStock = exports.getInventory;
exports.bulkStockUpdate = async (req, res, next) => {
  return res.status(400).json({
    success: false,
    message: 'Bulk stock update is disabled. Please use single authoritative stock adjustment.'
  });
};

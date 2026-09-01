const mongoose = require('mongoose');
const Product = require('../../models/Product');
const InventoryTransaction = require('../../models/InventoryTransaction');
const AuditService = require('../AuditService');
const { formatCsv } = require('../../utils/csvHelper');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

const { getRuntimeConfig } = require('../../config/runtime.config');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class InventoryService {
  /**
   * Determine if running in a deployed environment (staging or production)
   * using canonical runtime configuration.
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
   * Business validation, auth, insufficient stock, and AppErrors are never retried.
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
   * In production and staging, strictly fails closed if transactions are unavailable.
   * In standalone development/test environments, executes within isolated fallback.
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
            // Strictly bounded backoff (max total backoff < 300ms across all retries)
            await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 25) + 15 * attempt));
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
          // Strictly bounded backoff (max total backoff < 300ms across all retries)
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 25) + 15 * attempt));
          continue;
        }

        throw error;
      } finally {
        await session.endSession();
      }
    }
  }

  /**
   * Get server-side paginated inventory list with truthful sellable SKU summaries.
   */
  async getInventoryList({
    page = 1,
    limit = 15,
    search = '',
    category = '',
    stockStatus = 'all',
    sortBy = 'stock-asc'
  }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));
    const skip = (pageNum - 1) * limitNum;

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

    const sortMap = {
      'stock-asc': { stock: 1, _id: 1 },
      'stock-desc': { stock: -1, _id: -1 },
      'name-asc': { name: 1, _id: 1 },
      'name-desc': { name: -1, _id: -1 },
      'updatedAt-desc': { updatedAt: -1, _id: -1 }
    };
    const mongoSort = sortMap[sortBy] || { stock: 1, _id: 1 };

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

    // Compute global sellable SKU metrics across the complete catalog
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
          if (vStock <= 0) {
            outOfStockSkus += 1;
          } else if (vStock <= threshold) {
            lowStockSkus += 1;
          } else {
            inStockSkus += 1;
          }
        });
      } else {
        totalSellableSkus += 1;
        const pStock = p.stock || 0;
        totalPhysicalUnits += pStock;
        if (pStock <= 0) {
          outOfStockSkus += 1;
        } else if (pStock <= threshold) {
          lowStockSkus += 1;
        } else {
          inStockSkus += 1;
        }
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

  /**
   * Adjust inventory stock authoritatively with concurrency safety, idempotency replay,
   * root-stock synchronization, and immutable transaction audit recording.
   */
  async adjustStock({
    productId,
    variantId,
    type,
    quantity,
    reason,
    reference = '',
    operationKey,
    actorId,
    req
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

    // 1. Idempotency Check: if already executed with this operationKey, replay original result
    const existing = await InventoryTransaction.findOne({ operationKey: trimmedKey });
    if (existing) {
      const product = await Product.findById(productId);
      return {
        transaction: existing,
        product: {
          id: String(productId),
          name: product?.name || '',
          variantId: variantId || null,
          previousStock: existing.previousStock,
          newStock: existing.newStock,
          rootStock: product?.stock ?? existing.newStock
        },
        idempotentReplay: true
      };
    }

    let transactionDoc = null;
    let modifiedProduct = null;
    let previousStock = 0;
    let newStock = 0;

    try {
      await this.runTransaction(async (session) => {
        // Double check idempotency within transaction
        if (session) {
          const replayCheck = await InventoryTransaction.findOne({ operationKey: trimmedKey }).session(session);
          if (replayCheck) {
            transactionDoc = replayCheck;
            return;
          }
        }

        const productQuery = Product.findById(productId);
        if (session) productQuery.session(session);
        const product = await productQuery;

        if (!product) {
          throw new AppError('Product not found', 404, ERROR_CODES.PRODUCT_NOT_FOUND);
        }

        const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;

        let target;
        if (hasVariants) {
          if (!variantId) {
            throw new AppError(
              'Variant ID is required for variable product adjustment',
              400,
              ERROR_CODES.VALIDATION_ERROR
            );
          }
          target = product.variants.id(variantId);
          if (!target) {
            throw new AppError('Product variant not found', 404, ERROR_CODES.ORDER_VARIANT_NOT_FOUND);
          }
        } else {
          if (variantId) {
            throw new AppError(
              'Variant ID cannot be specified for simple products',
              400,
              ERROR_CODES.VALIDATION_ERROR
            );
          }
          target = product;
        }

        previousStock = target.stock || 0;
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

        target.stock = newStock;

        if (hasVariants) {
          // Synchronize root stock to sum of all variant stocks
          product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        }

        if (session) {
          await product.save({ session });
        } else {
          await product.save();
        }

        const delta = Math.abs(newStock - previousStock);
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
            sku: target.sku || product.sku || ''
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
      if (error?.code === 11000 && (error?.keyPattern?.operationKey || String(error?.message).includes('operationKey') || String(error?.message).includes('11000'))) {
        // Concurrent duplicate key race: fetch and return existing transaction
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

  /**
   * Get paginated immutable stock transaction history.
   */
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

  /**
   * Export inventory dataset to RFC-4180 CSV (one row per sellable SKU, bounded 5,000 rows).
   */
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

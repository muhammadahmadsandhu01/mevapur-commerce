const ProductCatalogService = require('../services/product/ProductCatalogService');
const Product = require('../models/Product');
const { AppError } = require('../common/errors/AppError');

const success = (res, statusCode, data, requestId, meta = {}) => res
  .status(statusCode)
  .json({
    success: true,
    data,
    meta: {
      requestId: requestId || 'unknown',
      ...meta
    }
  });

exports.getAdminProducts = async (req, res, next) => {
  try {
    const result = await ProductCatalogService.getAdminProducts(req.query);
    return res.status(200).json({
      success: true,
      data: result.products,
      pagination: result.pagination,
      summary: result.summary,
      meta: {
        requestId: req.requestId || 'unknown'
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .select('+costPrice')
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('brand', 'name')
      .populate('mediaAssetIds');

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    return success(res, 200, { product }, req.requestId);
  } catch (error) {
    return next(error);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const product = await ProductCatalogService.createProduct({
      data: req.body,
      userId: req.user.id
    });
    return success(res, 201, { product }, req.requestId);
  } catch (error) {
    return next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const product = await ProductCatalogService.updateProduct({
      id: req.params.id,
      data: req.body,
      userId: req.user.id
    });
    return success(res, 200, { product }, req.requestId);
  } catch (error) {
    return next(error);
  }
};

exports.publishProduct = async (req, res, next) => {
  try {
    const product = await ProductCatalogService.transitionLifecycle({
      id: req.params.id,
      targetStatus: 'published',
      expectedVersion: req.body.expectedVersion,
      userId: req.user.id
    });
    return success(res, 200, { product }, req.requestId);
  } catch (error) {
    return next(error);
  }
};

exports.unpublishProduct = async (req, res, next) => {
  try {
    const product = await ProductCatalogService.transitionLifecycle({
      id: req.params.id,
      targetStatus: 'inactive',
      expectedVersion: req.body.expectedVersion,
      userId: req.user.id
    });
    return success(res, 200, { product }, req.requestId);
  } catch (error) {
    return next(error);
  }
};

exports.archiveProduct = async (req, res, next) => {
  try {
    const product = await ProductCatalogService.transitionLifecycle({
      id: req.params.id,
      targetStatus: 'archived',
      expectedVersion: req.body.expectedVersion,
      userId: req.user.id
    });
    return success(res, 200, { product }, req.requestId);
  } catch (error) {
    return next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const result = await ProductCatalogService.deleteProduct({
      id: req.params.id,
      userId: req.user.id
    });
    return success(res, 200, result, req.requestId);
  } catch (error) {
    return next(error);
  }
};

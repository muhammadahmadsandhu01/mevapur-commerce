const mongoose = require('mongoose');
const slugify = require('slugify');
const Product = require('../../models/Product');
const MediaAsset = require('../../models/MediaAsset');
const InventoryTransaction = require('../../models/InventoryTransaction');
const SkuRegistryService = require('./SkuRegistryService');
const { assertProductsDeletable, assertVariantsRemovable } = require('../ProductCatalogIntegrityService');
const { validateMergedPublishedState } = require('../../validators/productValidator');
const { AppError } = require('../../common/errors/AppError');
const logger = require('../../utils/logger');

class ProductCatalogService {
  async runInTransaction(callback) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async resolveMediaAssets(mediaAssetIds, productId, session, fallbackImages = []) {
    if (!Array.isArray(mediaAssetIds) || mediaAssetIds.length === 0) {
      if (Array.isArray(fallbackImages) && fallbackImages.length > 0) {
        return {
          mediaAssetIds: [],
          images: fallbackImages,
          primaryImage: fallbackImages[0] || '',
          image: fallbackImages[0] || '',
          gallery: fallbackImages
        };
      }
      return { mediaAssetIds: [], images: [], primaryImage: '', image: '', gallery: [] };
    }

    let query = MediaAsset.find({ _id: { $in: mediaAssetIds } });
    if (session) query = query.session(session);
    const assets = await query;

    if (assets.length !== mediaAssetIds.length) {
      throw new AppError('One or more specified media assets were not found', 400, 'MEDIA_ASSET_NOT_FOUND');
    }

    // Check ownership/attachment validity
    for (const asset of assets) {
      if (asset.status === 'committed' && asset.attachedTo?.id && String(asset.attachedTo.id) !== String(productId)) {
        throw new AppError('Media asset is already committed to another product', 409, 'MEDIA_ASSET_ALREADY_COMMITTED');
      }
    }

    // Mark as committed and attached
    let updateQuery = MediaAsset.updateMany(
      { _id: { $in: mediaAssetIds } },
      { $set: { status: 'committed', 'attachedTo.id': productId, 'attachedTo.model': 'Product' } }
    );
    if (session) updateQuery = updateQuery.session(session);
    await updateQuery;

    const urls = assets.map(a => a.publicUrl);
    return {
      mediaAssetIds: assets.map(a => a._id),
      images: urls,
      primaryImage: urls[0] || '',
      image: urls[0] || '',
      gallery: urls
    };
  }

  async createProduct({ data, userId }) {
    return this.runInTransaction(async (session) => {
      const productId = new mongoose.Types.ObjectId();

      // 1. Generate Slug if absent
      let slug = data.slug;
      if (!slug || slug.trim() === '') {
        slug = slugify(data.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
      }

      // Check slug uniqueness
      const existingSlug = await Product.findOne({ slug }).session(session);
      if (existingSlug) {
        throw new AppError(`A product with slug '${slug}' already exists`, 409, 'PRODUCT_SLUG_EXISTS');
      }

      // 2. Resolve and Commit Media Assets
      const media = await this.resolveMediaAssets(data.mediaAssetIds || [], productId, session, data.images || []);

      // 3. Normalize Variants
      let variants = [];
      if (Array.isArray(data.variants) && data.variants.length > 0) {
        variants = data.variants.map((v, index) => ({
          _id: v._id ? new mongoose.Types.ObjectId(v._id) : new mongoose.Types.ObjectId(),
          sku: v.sku.trim().toUpperCase(),
          barcode: v.barcode ? v.barcode.trim() : '',
          attributes: v.attributes,
          price: Number(v.price),
          salePrice: v.salePrice ? Number(v.salePrice) : 0,
          stock: v.stock !== undefined ? Number(v.stock) : (v.initialStock !== undefined ? Number(v.initialStock) : 0),
          mediaAssetIds: v.mediaAssetIds || [],
          images: v.images || [],
          isDefault: v.isDefault !== undefined ? Boolean(v.isDefault) : (index === 0)
        }));

        if (!variants.some(v => v.isDefault)) {
          variants[0].isDefault = true;
        }
      }

      // 4. Reserve SKUs in SkuRegistry
      await SkuRegistryService.reserveSkus({
        productId,
        rootSku: data.sku || null,
        variants,
        session
      });

      // 5. Initial Stock Calculation
      let initialStock = Number(data.initialStock || 0);
      let calculatedStock = initialStock;
      if (variants.length > 0) {
        calculatedStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      }

      // 6. Build Product Document
      const status = data.status || 'draft';
      const isActive = (status === 'published');

      const product = new Product({
        _id: productId,
        name: data.name.trim(),
        slug,
        shortDescription: data.shortDescription || '',
        description: data.description || '',
        category: data.category || null,
        subcategory: data.subcategory || null,
        brand: data.brand || null,
        sku: data.sku ? data.sku.trim().toUpperCase() : null,
        price: data.price !== undefined ? Number(data.price) : 0,
        originalPrice: data.originalPrice !== undefined ? Number(data.originalPrice) : 0,
        stock: calculatedStock,
        lowStockThreshold: data.lowStockThreshold !== undefined ? Number(data.lowStockThreshold) : 10,
        status,
        isActive,
        isFeatured: Boolean(data.isFeatured),
        attributes: data.attributes || [],
        variants,
        mediaAssetIds: media.mediaAssetIds,
        primaryMediaAssetId: data.primaryMediaAssetId || (media.mediaAssetIds[0] || null),
        images: media.images,
        primaryImage: media.primaryImage,
        image: media.image,
        gallery: media.gallery,
        videoUrl: data.videoUrl || '',
        seo: data.seo || {}
      });

      await product.save({ session });

      // 7. Initial Stock Inventory Transactions (Zero-Quantity Rule: only if quantity > 0)
      if (variants.length > 0) {
        for (const variant of variants) {
          if (variant.stock > 0) {
            await InventoryTransaction.create([{
              product: productId,
              variantId: variant._id,
              type: 'in',
              quantity: variant.stock,
              previousStock: 0,
              newStock: variant.stock,
              reason: 'Initial stock on variant creation',
              reference: `INIT-${product.slug}-${variant.sku}`,
              performedBy: userId,
              metadata: {
                sku: variant.sku,
                isInitial: true
              }
            }], { session });
          }
        }
      } else if (initialStock > 0) {
        await InventoryTransaction.create([{
          product: productId,
          variantId: null,
          type: 'in',
          quantity: initialStock,
          previousStock: 0,
          newStock: initialStock,
          reason: 'Initial stock on product creation',
          reference: `INIT-${product.slug}`,
          performedBy: userId,
          metadata: {
            sku: product.sku || '',
            isInitial: true
          }
        }], { session });
      }

      logger.info('Product created successfully', {
        productId: product._id,
        slug: product.slug,
        status: product.status,
        userId
      });

      return product;
    });
  }

  async updateProduct({ id, data, userId }) {
    return this.runInTransaction(async (session) => {
      const product = await Product.findById(id).session(session);
      if (!product) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      // 1. Optimistic Concurrency Check
      if (data.expectedVersion !== undefined && product.__v !== data.expectedVersion) {
        throw new AppError(
          'This product was modified by another administrator. Please reload and review the latest changes.',
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      // 2. Check removed variants against historical references
      if (Array.isArray(data.variants)) {
        const oldVariantIds = product.variants.map(v => String(v._id));
        const incomingVariantIds = data.variants
          .filter(v => v._id)
          .map(v => String(v._id));

        const removedVariantIds = oldVariantIds.filter(oldId => !incomingVariantIds.includes(oldId));
        if (removedVariantIds.length > 0) {
          await assertVariantsRemovable(id, removedVariantIds, { session });
        }
      }

      // 3. Determine target lifecycle status
      const targetStatus = data.status || product.status;

      // 4. Merged State Validation if target status is published
      if (targetStatus === 'published') {
        const merged = {
          ...product.toObject(),
          ...data,
          status: 'published'
        };
        const validationErrors = validateMergedPublishedState(merged);
        if (validationErrors.length > 0) {
          throw new AppError(
            `Product cannot be published: ${validationErrors.map(e => e.message).join('; ')}`,
            400,
            'PRODUCT_PUBLICATION_VALIDATION_FAILED'
          );
        }
      }

      // 5. Slug check if changing
      if (data.slug && data.slug !== product.slug) {
        const conflict = await Product.findOne({ slug: data.slug, _id: { $ne: id } }).session(session);
        if (conflict) {
          throw new AppError(`A product with slug '${data.slug}' already exists`, 409, 'PRODUCT_SLUG_EXISTS');
        }
        product.slug = data.slug;
      }

      // 6. Variants and Stable Identity
      if (Array.isArray(data.variants)) {
        const updatedVariants = data.variants.map((v, index) => {
          let variantId;
          if (v._id) {
            if (!oldVariantIds.includes(String(v._id))) {
              throw new AppError(`Unknown variant ID '${v._id}'`, 400, 'UNKNOWN_VARIANT_ID');
            }
            variantId = new mongoose.Types.ObjectId(v._id);
          } else {
            variantId = new mongoose.Types.ObjectId();
          }

          const oldVar = product.variants.id(variantId);
          return {
            _id: variantId,
            sku: v.sku ? v.sku.trim().toUpperCase() : (oldVar?.sku || ''),
            barcode: v.barcode !== undefined ? v.barcode.trim() : (oldVar?.barcode || ''),
            attributes: v.attributes || oldVar?.attributes || [],
            price: v.price !== undefined ? Number(v.price) : (oldVar?.price || 0),
            salePrice: v.salePrice !== undefined ? Number(v.salePrice) : (oldVar?.salePrice || 0),
            stock: oldVar ? oldVar.stock : (v.stock || 0), // Stock not modified directly by edit
            mediaAssetIds: v.mediaAssetIds || oldVar?.mediaAssetIds || [],
            images: v.images || oldVar?.images || [],
            isDefault: v.isDefault !== undefined ? Boolean(v.isDefault) : (oldVar?.isDefault || (index === 0))
          };
        });

        product.variants = updatedVariants;
      }

      // 6. SkuRegistry Update
      const rootSku = data.sku !== undefined ? (data.sku ? data.sku.trim().toUpperCase() : null) : product.sku;
      await SkuRegistryService.reserveSkus({
        productId: id,
        rootSku,
        variants: product.variants,
        session
      });

      // 7. Media Asset Synchronization
      if (Array.isArray(data.mediaAssetIds)) {
        const oldMediaIds = (product.mediaAssetIds || []).map(m => String(m));
        const newMediaIds = data.mediaAssetIds.map(m => String(m));

        const removedMediaIds = oldMediaIds.filter(mId => !newMediaIds.includes(mId));
        if (removedMediaIds.length > 0) {
          // Mark removed media assets as deletion_requested
          await MediaAsset.updateMany(
            { _id: { $in: removedMediaIds } },
            { $set: { status: 'deletion_requested', nextRetryAt: new Date() } },
            { session }
          );
        }

        const media = await this.resolveMediaAssets(data.mediaAssetIds, id, session);
        product.mediaAssetIds = media.mediaAssetIds;
        product.images = media.images;
        product.primaryImage = media.primaryImage;
        product.image = media.image;
        product.gallery = media.gallery;
      }

      // 8. Assign Other Editable Fields
      if (data.name !== undefined) product.name = data.name.trim();
      if (data.shortDescription !== undefined) product.shortDescription = data.shortDescription;
      if (data.description !== undefined) product.description = data.description;
      if (data.category !== undefined) product.category = data.category;
      if (data.subcategory !== undefined) product.subcategory = data.subcategory;
      if (data.brand !== undefined) product.brand = data.brand;
      if (data.sku !== undefined) product.sku = data.sku ? data.sku.trim().toUpperCase() : null;
      if (data.price !== undefined) product.price = Number(data.price);
      if (data.originalPrice !== undefined) product.originalPrice = Number(data.originalPrice);
      if (data.lowStockThreshold !== undefined) product.lowStockThreshold = Number(data.lowStockThreshold);
      if (data.isFeatured !== undefined) product.isFeatured = Boolean(data.isFeatured);
      if (data.attributes !== undefined) product.attributes = data.attributes;
      if (data.videoUrl !== undefined) product.videoUrl = data.videoUrl;
      if (data.seo !== undefined) product.seo = data.seo;
      if (data.primaryMediaAssetId !== undefined) product.primaryMediaAssetId = data.primaryMediaAssetId;

      product.status = targetStatus;
      product.isActive = (targetStatus === 'published');

      product.increment();
      await product.save({ session });

      logger.info('Product updated successfully', {
        productId: product._id,
        slug: product.slug,
        version: product.__v,
        userId
      });

      return product;
    });
  }

  async transitionLifecycle({ id, targetStatus, expectedVersion, userId }) {
    return this.updateProduct({
      id,
      data: {
        status: targetStatus,
        expectedVersion
      },
      userId
    });
  }

  async deleteProduct({ id, userId }) {
    return this.runInTransaction(async (session) => {
      const product = await Product.findById(id).session(session);
      if (!product) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      // Two-Stage Deletion Gate: product must first be archived or inactive
      if (product.status === 'published' || product.isActive) {
        throw new AppError(
          'Published products cannot be deleted directly. Archive the product first.',
          400,
          'PRODUCT_MUST_BE_ARCHIVED_BEFORE_DELETE'
        );
      }

      // Commerce & Inventory Preflight
      await assertProductsDeletable([id], { session });

      // Release SKUs
      await SkuRegistryService.releaseAllForProduct(id, { session });

      // Mark media assets for deletion
      if (Array.isArray(product.mediaAssetIds) && product.mediaAssetIds.length > 0) {
        await MediaAsset.updateMany(
          { _id: { $in: product.mediaAssetIds } },
          { $set: { status: 'deletion_requested', nextRetryAt: new Date() } },
          { session }
        );
      }

      await Product.findByIdAndDelete(id).session(session);

      logger.info('Product hard deleted', { productId: id, userId });
      return { success: true, deletedId: id };
    });
  }

  async getAdminProducts(queryParams = {}) {
    const page = Math.max(1, Number(queryParams.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(queryParams.limit) || 12));
    const skip = (page - 1) * limit;

    const filter = {};

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    if (queryParams.category) {
      filter.category = queryParams.category;
    }

    if (queryParams.brand) {
      filter.brand = queryParams.brand;
    }

    if (queryParams.keyword && queryParams.keyword.trim() !== '') {
      const escaped = queryParams.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { sku: { $regex: escaped, $options: 'i' } },
        { 'variants.sku': { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } }
      ];
    }

    if (queryParams.stockStatus) {
      if (queryParams.stockStatus === 'out_of_stock') {
        filter.stock = { $lte: 0 };
      } else if (queryParams.stockStatus === 'low_stock') {
        filter.$expr = {
          $and: [
            { $gt: ['$stock', 0] },
            { $lte: ['$stock', '$lowStockThreshold'] }
          ]
        };
      } else if (queryParams.stockStatus === 'in_stock') {
        filter.$expr = {
          $gt: ['$stock', '$lowStockThreshold']
        };
      }
    }

    // Sort definition
    let sort = { createdAt: -1, _id: -1 };
    if (queryParams.sortBy === 'price-asc') sort = { price: 1, _id: -1 };
    if (queryParams.sortBy === 'price-desc') sort = { price: -1, _id: -1 };
    if (queryParams.sortBy === 'rating') sort = { rating: -1, _id: -1 };
    if (queryParams.sortBy === 'sold-desc') sort = { soldCount: -1, _id: -1 };

    const [products, totalFiltered, globalSummary] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .populate('brand', 'name')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
      Product.aggregate([
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            publishedCount: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
            draftCount: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
            inactiveCount: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
            archivedCount: { $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] } },
            outOfStockCount: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
            lowStockCount: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] },
                  1,
                  0
                ]
              }
            },
            inStockCount: {
              $sum: {
                $cond: [{ $gt: ['$stock', '$lowStockThreshold'] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const summary = globalSummary[0] || {
      totalProducts: 0,
      publishedCount: 0,
      draftCount: 0,
      inactiveCount: 0,
      archivedCount: 0,
      inStockCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0
    };

    return {
      products,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        pages: Math.ceil(totalFiltered / limit) || 1
      },
      summary: {
        global: summary
      }
    };
  }
}

module.exports = new ProductCatalogService();

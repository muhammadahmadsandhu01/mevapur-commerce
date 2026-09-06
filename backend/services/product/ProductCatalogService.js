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
      let rootSku = data.sku && typeof data.sku === 'string' && data.sku.trim() !== ''
        ? data.sku.trim().toUpperCase()
        : null;
      if (!rootSku) {
        const base = data.name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PRD';
        rootSku = `${base}-${Date.now().toString().slice(-4)}`;
      }

      await SkuRegistryService.reserveSkus({
        productId,
        rootSku,
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
        sku: rootSku,
        barcode: data.barcode ? data.barcode.trim() : '',
        costPrice: data.costPrice !== undefined ? Number(data.costPrice) : 0,
        price: data.price !== undefined ? Number(data.price) : 0,
        originalPrice: data.originalPrice !== undefined ? Number(data.originalPrice) : 0,
        stock: calculatedStock,
        lowStockThreshold: data.lowStockThreshold !== undefined ? Number(data.lowStockThreshold) : 10,
        status,
        isActive,
        isFeatured: Boolean(data.isFeatured),
        isNewArrival: Boolean(data.isNewArrival),
        isBestSeller: Boolean(data.isBestSeller),
        isTrending: Boolean(data.isTrending),
        allowBackorders: Boolean(data.allowBackorders),
        trackInventory: data.trackInventory !== false,
        tags: Array.isArray(data.tags) ? data.tags : [],
        ingredients: data.ingredients || '',
        nutritionalFacts: data.nutritionalFacts || '',
        storageInstructions: data.storageInstructions || '',
        shelfLife: data.shelfLife || '',
        countryOfOrigin: data.countryOfOrigin || 'Pakistan',
        weight: data.weight !== undefined ? Number(data.weight) : undefined,
        dimensions: data.dimensions || undefined,
        shippingClass: data.shippingClass || 'standard',
        freeShipping: Boolean(data.freeShipping),
        taxClass: data.taxClass || 'standard',
        publishDate: data.publishDate || null,
        enableReviews: data.enableReviews !== false,
        allowWishlist: data.allowWishlist !== false,
        allowCompare: data.allowCompare !== false,
        allowCOD: data.allowCOD !== false,
        relatedProducts: Array.isArray(data.relatedProducts) ? data.relatedProducts : [],
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
      const product = await Product.findById(id).select('+costPrice').session(session);
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
      const oldVariantIds = (product.variants || []).map(v => String(v._id));
      if (Array.isArray(data.variants)) {
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
            weight: v.weight !== undefined ? (v.weight === null ? undefined : Number(v.weight)) : oldVar?.weight,
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

      // 7. SkuRegistry Update
      const rootSku = data.sku !== undefined ? (data.sku ? data.sku.trim().toUpperCase() : null) : product.sku;
      await SkuRegistryService.reserveSkus({
        productId: id,
        rootSku,
        variants: product.variants,
        session
      });

      // 8. Media Asset Synchronization
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

      // 9. Assign All Editable Fields (preserving untouched fields on partial update)
      if (data.name !== undefined) product.name = data.name.trim();
      if (data.shortDescription !== undefined) product.shortDescription = data.shortDescription;
      if (data.description !== undefined) product.description = data.description;
      if (data.category !== undefined) product.category = data.category || null;
      if (data.subcategory !== undefined) product.subcategory = data.subcategory || null;
      if (data.brand !== undefined) product.brand = data.brand || null;
      if (data.sku !== undefined) product.sku = data.sku ? data.sku.trim().toUpperCase() : null;
      if (data.barcode !== undefined) product.barcode = data.barcode ? data.barcode.trim() : '';
      if (data.costPrice !== undefined) product.costPrice = Number(data.costPrice);
      if (data.price !== undefined) product.price = Number(data.price);
      if (data.originalPrice !== undefined) product.originalPrice = Number(data.originalPrice);
      if (data.lowStockThreshold !== undefined) product.lowStockThreshold = Number(data.lowStockThreshold);
      if (data.isFeatured !== undefined) product.isFeatured = Boolean(data.isFeatured);
      if (data.isNewArrival !== undefined) product.isNewArrival = Boolean(data.isNewArrival);
      if (data.isBestSeller !== undefined) product.isBestSeller = Boolean(data.isBestSeller);
      if (data.isTrending !== undefined) product.isTrending = Boolean(data.isTrending);
      if (data.allowBackorders !== undefined) product.allowBackorders = Boolean(data.allowBackorders);
      if (data.trackInventory !== undefined) product.trackInventory = Boolean(data.trackInventory);
      if (data.tags !== undefined) product.tags = Array.isArray(data.tags) ? data.tags : [];
      if (data.ingredients !== undefined) product.ingredients = data.ingredients;
      if (data.nutritionalFacts !== undefined) product.nutritionalFacts = data.nutritionalFacts;
      if (data.storageInstructions !== undefined) product.storageInstructions = data.storageInstructions;
      if (data.shelfLife !== undefined) product.shelfLife = data.shelfLife;
      if (data.countryOfOrigin !== undefined) product.countryOfOrigin = data.countryOfOrigin;
      if (data.weight !== undefined) product.weight = (data.weight !== null && data.weight !== '') ? Number(data.weight) : undefined;
      if (data.dimensions !== undefined) product.dimensions = data.dimensions;
      if (data.shippingClass !== undefined) product.shippingClass = data.shippingClass;
      if (data.freeShipping !== undefined) product.freeShipping = Boolean(data.freeShipping);
      if (data.taxClass !== undefined) product.taxClass = data.taxClass;
      if (data.publishDate !== undefined) product.publishDate = data.publishDate || null;
      if (data.enableReviews !== undefined) product.enableReviews = Boolean(data.enableReviews);
      if (data.allowWishlist !== undefined) product.allowWishlist = Boolean(data.allowWishlist);
      if (data.allowCompare !== undefined) product.allowCompare = Boolean(data.allowCompare);
      if (data.allowCOD !== undefined) product.allowCOD = Boolean(data.allowCOD);
      if (data.relatedProducts !== undefined) product.relatedProducts = Array.isArray(data.relatedProducts) ? data.relatedProducts : [];
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
        .select('+costPrice')
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

const SkuRegistry = require('../../models/SkuRegistry');
const { AppError } = require('../../common/errors/AppError');
const logger = require('../../utils/logger');

class SkuRegistryService {
  async reserveSkus({ productId, rootSku = null, variants = [], session }) {
    const skuItems = [];

    if (rootSku && typeof rootSku === 'string' && rootSku.trim() !== '') {
      skuItems.push({
        sku: rootSku.trim().toUpperCase(),
        product: productId,
        variantId: null,
        isRoot: true
      });
    }

    if (Array.isArray(variants)) {
      variants.forEach(variant => {
        if (variant.sku && typeof variant.sku === 'string' && variant.sku.trim() !== '') {
          skuItems.push({
            sku: variant.sku.trim().toUpperCase(),
            product: productId,
            variantId: variant._id || null,
            isRoot: false
          });
        }
      });
    }

    if (skuItems.length === 0) {
      // Release any existing SKUs for this product if all were removed
      let deleteQuery = SkuRegistry.deleteMany({ product: productId });
      if (session) deleteQuery = deleteQuery.session(session);
      await deleteQuery;
      return;
    }

    const incomingSkus = skuItems.map(item => item.sku);

    // 1. Conflict Check: look for any SKU owned by a different product
    let conflictQuery = SkuRegistry.find({
      sku: { $in: incomingSkus },
      product: { $ne: productId }
    });
    if (session) conflictQuery = conflictQuery.session(session);
    const conflicts = await conflictQuery;

    if (conflicts.length > 0) {
      const conflictSku = conflicts[0].sku;
      throw new AppError(
        `SKU '${conflictSku}' is already registered to another product`,
        409,
        'SKU_ALREADY_EXISTS'
      );
    }

    // 2. Remove old SKUs for this product not present in the new set
    let cleanupQuery = SkuRegistry.deleteMany({
      product: productId,
      sku: { $nin: incomingSkus }
    });
    if (session) cleanupQuery = cleanupQuery.session(session);
    await cleanupQuery;

    // 3. Upsert active SKUs
    for (const item of skuItems) {
      const updateOptions = { upsert: true, new: true };
      if (session) updateOptions.session = session;

      await SkuRegistry.findOneAndUpdate(
        { sku: item.sku },
        {
          $set: {
            product: item.product,
            variantId: item.variantId,
            isRoot: item.isRoot
          }
        },
        updateOptions
      );
    }
  }

  async releaseAllForProduct(productId, { session } = {}) {
    let query = SkuRegistry.deleteMany({ product: productId });
    if (session) query = query.session(session);
    await query;
  }
}

module.exports = new SkuRegistryService();

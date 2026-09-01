const mongoose = require('mongoose');
const SkuRegistry = require('../../../models/SkuRegistry');
const SkuRegistryService = require('../../../services/product/SkuRegistryService');

describe('SkuRegistryService Unit Tests', () => {
  let productId1;
  let productId2;

  beforeEach(async () => {
    productId1 = new mongoose.Types.ObjectId();
    productId2 = new mongoose.Types.ObjectId();
  });

  it('reserves root and variant SKUs successfully with uppercase normalization', async () => {
    const variantId = new mongoose.Types.ObjectId();
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      rootSku: 'alm-root',
      variants: [{ _id: variantId, sku: 'alm-var-100' }]
    });

    const entries = await SkuRegistry.find({ product: productId1 });
    expect(entries).toHaveLength(2);
    expect(entries.some(e => e.sku === 'ALM-ROOT' && e.isRoot === true)).toBe(true);
    expect(entries.some(e => e.sku === 'ALM-VAR-100' && e.isRoot === false)).toBe(true);
  });

  it('rejects cross-product root-to-root SKU collision', async () => {
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      rootSku: 'ROOT-COLLISION'
    });

    await expect(SkuRegistryService.reserveSkus({
      productId: productId2,
      rootSku: 'root-collision'
    })).rejects.toThrow("SKU 'ROOT-COLLISION' is already registered to another product");
  });

  it('rejects cross-product root-to-variant SKU collision', async () => {
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      rootSku: 'SHARED-SKU-1'
    });

    await expect(SkuRegistryService.reserveSkus({
      productId: productId2,
      variants: [{ sku: 'shared-sku-1' }]
    })).rejects.toThrow("SKU 'SHARED-SKU-1' is already registered to another product");
  });

  it('rejects cross-product variant-to-variant SKU collision', async () => {
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      variants: [{ sku: 'VAR-COLLISION-1' }]
    });

    await expect(SkuRegistryService.reserveSkus({
      productId: productId2,
      variants: [{ sku: 'var-collision-1' }]
    })).rejects.toThrow("SKU 'VAR-COLLISION-1' is already registered to another product");
  });

  it('releases unreferenced SKUs upon update', async () => {
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      rootSku: 'OLD-ROOT-SKU',
      variants: [{ sku: 'OLD-VAR-SKU' }]
    });

    // Update with new SKU
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      rootSku: 'NEW-ROOT-SKU',
      variants: []
    });

    const entries = await SkuRegistry.find({ product: productId1 });
    expect(entries).toHaveLength(1);
    expect(entries[0].sku).toBe('NEW-ROOT-SKU');
  });

  it('releases all SKUs on product deletion', async () => {
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      rootSku: 'DELETE-ME-SKU'
    });

    await SkuRegistryService.releaseAllForProduct(productId1);
    const count = await SkuRegistry.countDocuments({ product: productId1 });
    expect(count).toBe(0);
  });
});

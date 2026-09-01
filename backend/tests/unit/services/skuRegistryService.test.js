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

  it('reserves root and variant SKUs successfully', async () => {
    const variantId = new mongoose.Types.ObjectId();
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      rootSku: 'ALM-ROOT',
      variants: [{ _id: variantId, sku: 'ALM-VAR-100' }]
    });

    const entries = await SkuRegistry.find({ product: productId1 });
    expect(entries).toHaveLength(2);
    expect(entries.some(e => e.sku === 'ALM-ROOT' && e.isRoot === true)).toBe(true);
    expect(entries.some(e => e.sku === 'ALM-VAR-100' && e.isRoot === false)).toBe(true);
  });

  it('rejects cross-product SKU collision', async () => {
    // Product 1 registers SKU
    await SkuRegistryService.reserveSkus({
      productId: productId1,
      rootSku: 'SHARED-SKU-1'
    });

    // Product 2 attempts to use same SKU as variant
    await expect(SkuRegistryService.reserveSkus({
      productId: productId2,
      variants: [{ sku: 'shared-sku-1' }]
    })).rejects.toThrow("SKU 'SHARED-SKU-1' is already registered to another product");
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

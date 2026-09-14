const request = require('supertest');
const app = require('../../app');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const Wishlist = require('../../models/Wishlist');
const { searchPublicProducts, getPublicProductDetails } = require('../../modules/assistant/tools/assistantReadTools');

describe('Market Catalog Visibility & Search Integration Tests', () => {
  let defaultCategory;
  let activeConfig;
  let globalProduct;
  let gbOnlyProduct;
  let suspendedProduct;
  let priceMissingProduct;

  beforeEach(async () => {
    await Product.deleteMany({});
    await Category.deleteMany({});
    await CommerceConfigurationVersion.deleteMany({});
    await ProductMarketOffering.deleteMany({});
    await MarketPriceBook.deleteMany({});
    await Wishlist.deleteMany({});

    defaultCategory = await Category.create({
      name: 'Organic Foods',
      slug: `organic-foods-${Date.now()}`,
      isActive: true,
      isVisible: true
    });

    activeConfig = await CommerceConfigurationVersion.create({
      merchantScopeId: 'default',
      version: 1,
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      effectiveTo: null,
      lockVersion: 1,
      merchantProfile: {
        merchantCountry: 'PK',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        sellingMode: 'hybrid',
        enabledCountries: ['PK', 'AE', 'GB', 'US', 'DE'],
        enabledCurrencies: ['PKR', 'AED', 'GBP', 'USD', 'EUR'],
        defaultLocale: 'en-PK',
        defaultTimeZone: 'Asia/Karachi',
        supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
        taxCalculationMode: 'exact_rational',
        fulfillmentOrigins: [{
          originId: 'origin-pk-main',
          name: 'Karachi Central Hub',
          country: 'PK',
          city: 'Karachi',
          timeZone: 'Asia/Karachi',
          enabled: true,
          isDefault: true
        }]
      },
      shippingRules: [],
      taxRules: []
    });

    // 1. Global product available in PK and GB with independent prices
    globalProduct = await Product.create({
      name: 'Himalayan Organic Pine Nuts',
      slug: `pine-nuts-${Date.now()}`,
      price: 3000,
      stock: 100,
      category: defaultCategory._id,
      isActive: true,
      status: 'published'
    });

    // PK Offering & Price (PKR 3000 -> 300000 minor)
    await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: globalProduct._id,
      marketCountry: 'PK',
      status: 'active',
      visibility: 'visible',
      fulfillmentMode: 'local',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });
    await MarketPriceBook.create({
      merchantScopeId: 'default',
      productId: globalProduct._id,
      marketCountry: 'PK',
      currency: 'PKR',
      currencyExponent: 2,
      amountMinor: '300000',
      priceSource: 'manual',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    // GB Offering & Price (GBP 25.50 -> 2550 minor)
    await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: globalProduct._id,
      marketCountry: 'GB',
      status: 'active',
      visibility: 'visible',
      fulfillmentMode: 'cross_border',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });
    await MarketPriceBook.create({
      merchantScopeId: 'default',
      productId: globalProduct._id,
      marketCountry: 'GB',
      currency: 'GBP',
      currencyExponent: 2,
      amountMinor: '2550',
      priceSource: 'manual',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    // 2. GB-Only Product
    gbOnlyProduct = await Product.create({
      name: 'British Export Premium Almonds',
      slug: `gb-almonds-${Date.now()}`,
      price: 1800,
      stock: 50,
      category: defaultCategory._id,
      isActive: true,
      status: 'published'
    });
    await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: gbOnlyProduct._id,
      marketCountry: 'GB',
      status: 'active',
      visibility: 'visible',
      fulfillmentMode: 'cross_border',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });
    await MarketPriceBook.create({
      merchantScopeId: 'default',
      productId: gbOnlyProduct._id,
      marketCountry: 'GB',
      currency: 'GBP',
      currencyExponent: 2,
      amountMinor: '1850',
      priceSource: 'manual',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    // 3. Suspended Product for GB
    suspendedProduct = await Product.create({
      name: 'Suspended Export Walnuts',
      slug: `suspended-walnuts-${Date.now()}`,
      price: 1500,
      stock: 40,
      category: defaultCategory._id,
      isActive: true,
      status: 'published'
    });
    await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: suspendedProduct._id,
      marketCountry: 'GB',
      status: 'suspended', // Suspended!
      visibility: 'visible',
      fulfillmentMode: 'cross_border',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });
    await MarketPriceBook.create({
      merchantScopeId: 'default',
      productId: suspendedProduct._id,
      marketCountry: 'GB',
      currency: 'GBP',
      currencyExponent: 2,
      amountMinor: '1200',
      priceSource: 'manual',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    // 4. Product with active offering but missing price book entry for GB
    priceMissingProduct = await Product.create({
      name: 'Priceless Dried Figs',
      slug: `priceless-figs-${Date.now()}`,
      price: 1000,
      stock: 20,
      category: defaultCategory._id,
      isActive: true,
      status: 'published'
    });
    await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: priceMissingProduct._id,
      marketCountry: 'GB',
      status: 'active',
      visibility: 'visible',
      fulfillmentMode: 'cross_border',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });
    // No MarketPriceBook entry created for GB
  });

  describe('1. Public Product Listings & Market Filtering', () => {
    it('1. GB shopper receives only GB-eligible products with GBP exact price', async () => {
      const res = await request(app)
        .get('/api/products?market=GB');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const items = res.body.data.products || res.body.data.items || res.body.data;
      expect(Array.isArray(items)).toBe(true);
      
      // Should include globalProduct and gbOnlyProduct (2 items), NOT suspended or price-missing
      expect(items.length).toBe(2);
      
      const p1 = items.find(p => String(p._id) === String(globalProduct._id));
      expect(p1).toBeDefined();
      expect(p1.currency).toBe('GBP');
      expect(p1.price).toBe(25.5);
      expect(p1.marketPriceExact).toBeDefined();
      expect(p1.marketPriceExact.currency).toBe('GBP');
      expect(p1.marketPriceExact.amountMinor).toBe('2550');

      const p2 = items.find(p => String(p._id) === String(gbOnlyProduct._id));
      expect(p2).toBeDefined();
      expect(p2.currency).toBe('GBP');
      expect(p2.price).toBe(18.5);
      expect(p2.marketPriceExact.amountMinor).toBe('1850');
    });

    it('2. PK shopper receives only PK-eligible products with PKR exact price', async () => {
      const res = await request(app)
        .get('/api/products?market=PK');

      expect(res.status).toBe(200);
      const items = res.body.data.products || res.body.data.items || res.body.data;
      // Only globalProduct has PK offering
      expect(items.length).toBe(1);
      expect(String(items[0]._id)).toBe(String(globalProduct._id));
      expect(items[0].currency).toBe('PKR');
      expect(items[0].price).toBe(3000);
      expect(items[0].marketPriceExact.currency).toBe('PKR');
      expect(items[0].marketPriceExact.amountMinor).toBe('300000');
    });

    it('3. AE shopper query yields 0 products when no AE offerings exist', async () => {
      const res = await request(app)
        .get('/api/products?market=AE');

      expect(res.status).toBe(200);
      const items = res.body.data.products || res.body.data.items || res.body.data;
      expect(items.length).toBe(0);
    });

    it('4. Direct request for GB-only product from AE market returns public 404', async () => {
      const res = await request(app)
        .get(`/api/products/${gbOnlyProduct._id}?market=AE`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      // No internal leak of offering status or reasons
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toMatch(/not found/i);
    });

    it('5. Direct request for suspended product returns public 404', async () => {
      const res = await request(app)
        .get(`/api/products/${suspendedProduct._id}?market=GB`);

      expect(res.status).toBe(404);
    });

    it('6. Direct request for product missing price book returns public 404', async () => {
      const res = await request(app)
        .get(`/api/products/${priceMissingProduct._id}?market=GB`);

      expect(res.status).toBe(404);
    });
  });

  describe('2. Search, Recommendations, and Assistant Tools Market Integrity', () => {
    it('7. Top and recommended endpoints honor market context', async () => {
      const topRes = await request(app)
        .get('/api/products/top?market=GB');
      expect(topRes.status).toBe(200);
      const topItems = topRes.body.data.products || topRes.body.data.items || topRes.body.data;
      expect(topItems.every(item => item.currency === 'GBP')).toBe(true);

      const recRes = await request(app)
        .get('/api/products/recommended?market=GB');
      expect(recRes.status).toBe(200);
      const recItems = recRes.body.data.products || recRes.body.data.items || recRes.body.data;
      expect(recItems.every(item => item.currency === 'GBP')).toBe(true);
    });

    it('8. Assistant searchPublicProducts tool filters by market', async () => {
      const resultGb = await searchPublicProducts({ query: 'Pine', market: 'GB' });
      expect(Array.isArray(resultGb)).toBe(true);
      expect(resultGb.length).toBe(1);
      expect(resultGb[0].name).toContain('Pine Nuts');
      expect(resultGb[0].currency).toBe('GBP');

      const resultAe = await searchPublicProducts({ query: 'Pine', market: 'AE' });
      expect(Array.isArray(resultAe)).toBe(true);
      expect(resultAe.length).toBe(0);
    });

    it('9. Assistant getPublicProductDetails returns truthful error for ineligible market', async () => {
      const detailRes = await getPublicProductDetails({
        productId: String(gbOnlyProduct._id),
        market: 'AE'
      });
      expect(detailRes).toBeNull();
    });

    it('10. Malformed or injection market parameter falls back safely or fails closed', async () => {
      const res = await request(app)
        .get('/api/products?market={"$gt":""}');

      // Should safely treat as invalid and fall back to merchant default market (PK) or fail closed
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        const items = res.body.data.products || res.body.data.items || res.body.data;
        // In fallback home market (PK), only globalProduct is eligible
        expect(items.length).toBe(1);
      }
    });
  });
});

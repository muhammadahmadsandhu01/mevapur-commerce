/**
 * @file phase6d3-shipping-governance.integration.test.js
 * @description Integration test suite for Phase 6D-3 shipping governance, routing, and landed-cost authority.
 */

const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Category = require('../../models/Category');
const Product = require('../../models/Product');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const MarketPriceBook = require('../../models/MarketPriceBook');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const Order = require('../../models/Order');
const ShippingServiceabilityService = require('../../services/shipping/ShippingServiceabilityService');
const DeliveryPromiseService = require('../../services/shipping/DeliveryPromiseService');
const CheckoutQuoteService = require('../../services/checkout/CheckoutQuoteService');
const OrderService = require('../../services/order/OrderService');
const ReturnMoneyAllocationService = require('../../services/ReturnMoneyAllocationService');
const { Money, MoneyMapper } = require('../../modules/commerce');

describe('Phase 6D-3: Shipping Governance & Multi-Service Integration', () => {
  let customerUser;
  let testCategory;
  let testProduct;
  let activeConfigDoc;
  let serviceabilityService;
  let promiseService;
  let sequence = 0;

  beforeEach(async () => {
    serviceabilityService = new ShippingServiceabilityService();
    promiseService = new DeliveryPromiseService();

    const seq = ++sequence;

    // 1. Seed Customer User
    customerUser = await User.create({
      fullName: `Customer Phase6D3 ${seq}`,
      email: `customer.p6d3.${seq}@mevapur.test`,
      password: 'Password123!',
      role: 'customer',
      residenceCountry: 'AE',
      isCountryComplete: true,
      verified: true
    });

    // 2. Seed Fulfillment Locations
    const locations = await FulfillmentLocation.create([
      {
        locationCode: `KHI-WH-${seq}`,
        displayName: 'Karachi Central Hub',
        countryCode: 'PK',
        subdivision: 'SD',
        city: 'Karachi',
        timeZone: 'Asia/Karachi',
        status: 'active',
        priority: 10,
        supportedMarketCountries: ['PK', 'AE', 'GB', 'US'],
        supportedServiceLevels: ['standard', 'express'],
        addressLine1: 'Plot 12, Korangi Industrial Area'
      },
      {
        locationCode: `DXB-WH-${seq}`,
        displayName: 'Dubai Logistics Hub',
        countryCode: 'AE',
        subdivision: 'Dubai',
        city: 'Dubai',
        timeZone: 'Asia/Dubai',
        status: 'active',
        priority: 20,
        supportedMarketCountries: ['AE', 'PK'],
        supportedServiceLevels: ['standard', 'express'],
        addressLine1: 'Building 4, DAFZA'
      }
    ]);

    // 3. Seed Governed Configuration Version
    activeConfigDoc = await CommerceConfigurationVersion.create({
      merchantScopeId: 'default',
      version: 300 + seq,
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      merchantProfile: {
        merchantCountry: 'PK',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        sellingMode: 'hybrid',
        enabledCountries: ['PK', 'AE', 'GB', 'US'],
        enabledCurrencies: ['PKR', 'AED', 'GBP', 'USD'],
        defaultLocale: 'en-PK',
        defaultTimeZone: 'Asia/Karachi',
        supportedIncoterms: ['DOMESTIC', 'DDP', 'DAP'],
        taxCalculationMode: 'exact_rational',
        fulfillmentOrigins: [
          {
            originId: 'origin-pk-central',
            name: 'Pakistan Central Warehouse',
            country: 'PK',
            city: 'Karachi',
            timeZone: 'Asia/Karachi',
            enabled: true,
            isDefault: true
          },
          {
            originId: 'origin-ae-hub',
            name: 'Dubai Regional Warehouse',
            country: 'AE',
            city: 'Dubai',
            timeZone: 'Asia/Dubai',
            enabled: true,
            isDefault: false
          }
        ]
      },
      shippingRules: [
        {
          ruleId: 'GOV-SHIP-PK-STD',
          name: 'Pakistan Domestic Standard',
          serviceCode: 'standard',
          displayName: 'TCS Ground Standard',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
          freeShippingThresholdExact: MoneyMapper.fromLegacy(5000, 'PKR'),
          remoteRateExact: MoneyMapper.fromLegacy(350, 'PKR'),
          remoteCities: ['Gwadar', 'Skardu'],
          remotePostalPrefixes: ['89100'],
          deliveryMinDays: 2,
          deliveryMaxDays: 4,
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          weightBands: [
            { minWeightGrams: 0, maxWeightGrams: 1000, rateExact: MoneyMapper.fromLegacy(250, 'PKR'), pricingMode: 'REPLACE_BASE' },
            { minWeightGrams: 1000, maxWeightGrams: 5000, rateExact: MoneyMapper.fromLegacy(100, 'PKR'), pricingMode: 'ADD_TO_BASE' }
          ],
          supportedIncoterms: ['DOMESTIC'],
          priority: 10,
          enabled: true
        },
        {
          ruleId: 'GOV-SHIP-AE-STD',
          name: 'UAE International Standard',
          serviceCode: 'standard',
          displayName: 'Aramex UAE Ground',
          originCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: MoneyMapper.fromLegacy(35, 'AED'),
          freeShippingThresholdExact: MoneyMapper.fromLegacy(300, 'AED'),
          remoteRateExact: MoneyMapper.fromLegacy(20, 'AED'),
          remoteCities: ['Hatta', 'Liwa'],
          deliveryMinDays: 3,
          deliveryMaxDays: 6,
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          weightBands: [
            { minWeightGrams: 0, maxWeightGrams: 2000, rateExact: MoneyMapper.fromLegacy(35, 'AED'), pricingMode: 'REPLACE_BASE' },
            { minWeightGrams: 2000, maxWeightGrams: 10000, rateExact: MoneyMapper.fromLegacy(25, 'AED'), pricingMode: 'ADD_TO_BASE' }
          ],
          supportedIncoterms: ['DDP', 'DOMESTIC'],
          priority: 20,
          enabled: true
        },
        {
          ruleId: 'GOV-SHIP-AE-EXP',
          name: 'UAE International Express',
          serviceCode: 'express',
          displayName: 'DHL UAE Express Priority',
          originCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: MoneyMapper.fromLegacy(70, 'AED'),
          deliveryMinDays: 1,
          deliveryMaxDays: 3,
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          supportedIncoterms: ['DDP', 'DOMESTIC'],
          priority: 5,
          enabled: true
        }
      ],
      taxRules: [
        {
          ruleId: 'GOV-TAX-PK-DOM',
          destinationCountry: 'PK',
          taxType: 'SALES_TAX',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal',
          taxRateNumerator: 0,
          taxRateDenominator: 10000,
          dutyRateNumerator: 0,
          dutyRateDenominator: 10000,
          incoterm: 'DOMESTIC',
          sourceAuthority: 'Federal Board of Revenue Pakistan',
          sourceReference: 'FBR-GST-001',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          requiresTax: false,
          requiresDuty: false,
          dutyRefundPolicy: 'REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
          customsValueIncludesShipping: false,
          customsValueIncludesInsurance: false,
          enabled: true
        },
        {
          ruleId: 'GOV-TAX-AE-DDP',
          destinationCountry: 'AE',
          taxType: 'VAT',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal_shipping',
          taxRateNumerator: 500,
          taxRateDenominator: 10000,
          dutyRateNumerator: 500,
          dutyRateDenominator: 10000,
          incoterm: 'DDP',
          sourceAuthority: 'UAE Federal Tax Authority',
          sourceReference: 'FTA-VAT-2018',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          requiresTax: true,
          requiresDuty: true,
          dutyRefundPolicy: 'REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
          customsValueIncludesShipping: true,
          customsValueIncludesInsurance: false,
          enabled: true
        }
      ]
    });

    // 4. Seed Category & Simple Product
    testCategory = await Category.create({
      name: `Dry Fruits ${seq}`,
      slug: `dry-fruits-${seq}`,
      isActive: true
    });

    testProduct = await Product.create({
      name: `MevaPur Organic Almonds ${seq}`,
      slug: `mevapur-almonds-${seq}`,
      sku: `SKU-ALMOND-${seq}`,
      description: 'Premium organic almonds',
      category: testCategory._id,
      price: 1000,
      priceExact: MoneyMapper.fromLegacy(1000, 'PKR'),
      weightGrams: 500,
      originCountry: 'PK',
      countryOfOrigin: 'PK',
      hsCode: '080212',
      hsClassification: {
        code: '080212',
        description: 'Shelled Almonds',
        source: 'MANUAL_OVERRIDE',
        confidence: 'VERIFIED',
        sourceReference: 'CUSTOMS-FIXTURE-2026'
      },
      customsDescription: 'Shelled edible almonds for retail sale',
      hsTariffCode: {
        code: '080212',
        systemVersion: 'HS_2022',
        jurisdiction: 'WCO'
      },
      declaredValueEligibility: 'ELIGIBLE',
      dangerousGoodsClassification: 'NOT_RESTRICTED',
      isActive: true,
      countInStock: 200,
      stock: 200
    });

    // 4b. Seed Inventory Positions
    await InventoryPosition.create([
      {
        merchantScopeId: 'default',
        locationId: locations[0]._id,
        locationCode: locations[0].locationCode,
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: testProduct.sku,
        onHand: 100,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        lockVersion: 1
      }
    ]);

    // 5. Seed Price Books
    await MarketPriceBook.create([
      {
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        currency: 'PKR',
        currencyExponent: 2,
        amountMinor: '100000',
        status: 'active',
        effectiveFrom: new Date(Date.now() - 60000)
      },
      {
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'AE',
        currency: 'AED',
        currencyExponent: 2,
        amountMinor: '10000',
        status: 'active',
        effectiveFrom: new Date(Date.now() - 60000)
      }
    ]);

    await ProductMarketOffering.create([
      {
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        pricingPolicy: 'inherit_product_price',
        effectiveFrom: new Date(Date.now() - 60000)
      },
      {
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'AE',
        status: 'active',
        visibility: 'visible',
        pricingPolicy: 'inherit_product_price',
        effectiveFrom: new Date(Date.now() - 60000)
      }
    ]);
  });

  describe('1. Zero-Write Public Quote / Serviceability Boundary', () => {
    it('1.1 evaluates public quote with zero persistent database mutations across all collections', async () => {
      const collections = mongoose.connection.collections;
      const countsBefore = {};
      for (const [name, col] of Object.entries(collections)) {
        countsBefore[name] = await col.countDocuments({});
      }

      const res = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(testProduct._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Fatima Al-Zahra',
            phone: '+971501234567',
            address: 'Al Wasl Road, Villa 42',
            city: 'Dubai',
            province: 'Dubai',
            country: 'AE'
          },
          currency: 'AED'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      for (const [name, col] of Object.entries(collections)) {
        const countAfter = await col.countDocuments({});
        expect(countAfter).toBe(countsBefore[name]);
      }
    });

    it('1.2 fails closed with 409 CUSTOMS_METADATA_INCOMPLETE when international item is missing valid HS code', async () => {
      const nonHsProduct = await Product.create({
        name: `Non HS Product ${Date.now()}`,
        slug: `non-hs-product-${Date.now()}`,
        sku: `SKU-NOHS-${Date.now()}`,
        category: testCategory._id,
        status: 'published',
        price: 500,
        priceExact: MoneyMapper.fromLegacy(500, 'PKR'),
        originCountry: 'PK',
        countryOfOrigin: 'PK',
        weightGrams: 500,
        isActive: true,
        countInStock: 50,
        stock: 50
      });

      await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: (await FulfillmentLocation.findOne({ countryCode: 'PK' }))._id,
        locationCode: 'KHI-WH-TEST',
        productId: nonHsProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: nonHsProduct.sku,
        onHand: 50,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        lockVersion: 1
      });

      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: nonHsProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'AE',
        currency: 'AED',
        currencyExponent: 2,
        amountMinor: '5000',
        status: 'active',
        effectiveFrom: new Date(Date.now() - 60000)
      });

      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: nonHsProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'AE',
        status: 'active',
        visibility: 'visible',
        pricingPolicy: 'inherit_product_price',
        effectiveFrom: new Date(Date.now() - 60000)
      });

      const res = await request(app)
        .post('/api/commerce/checkout/quote')
        .send({
          items: [{ productId: String(nonHsProduct._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Fatima Al-Zahra',
            phone: '+971501234567',
            address: 'Al Wasl Road, Villa 42',
            city: 'Dubai',
            province: 'Dubai',
            country: 'AE'
          },
          currency: 'AED'
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.code).toBe('CUSTOMS_METADATA_INCOMPLETE');
    });
  });

  describe('2. Multi-Service Options Quoting & Delivery Promises', () => {
    it('2.1 discovers all available shipping options and calculates accurate delivery promises', async () => {
      const serviceability = await serviceabilityService.evaluateServiceability({
        countryCode: 'AE',
        originCountry: 'PK',
        currency: 'AED',
        subtotalMoney: Money.fromLegacyNumber(100, 'AED'),
        shippingRules: activeConfigDoc.shippingRules
      });

      expect(serviceability.isServiceable).toBe(true);
      expect(serviceability.options.length).toBe(2);

      const standardOpt = serviceability.options.find((o) => o.serviceLevel === 'standard');
      const expressOpt = serviceability.options.find((o) => o.serviceLevel === 'express');

      expect(standardOpt).toBeDefined();
      expect(standardOpt.shippingAmount).toBe(35);
      expect(expressOpt).toBeDefined();
      expect(expressOpt.shippingAmount).toBe(70);

      const standardPromise = promiseService.calculatePromise({
        orderDate: '2026-09-16T08:00:00.000Z',
        originTimeZone: 'Asia/Karachi',
        processingCutoffLocal: '14:00',
        workingDays: [1, 2, 3, 4, 5],
        deliveryMinDays: standardOpt.deliveryEstimate.minDays,
        deliveryMaxDays: standardOpt.deliveryEstimate.maxDays
      });

      expect(standardPromise.isSameDayDispatch).toBe(true);
      expect(standardPromise.promiseText).toBe('3-6 business days');
    });
  });

  describe('3. Order Creation Landed-Cost Snapshot & Quote Revalidation', () => {
    it('3.1 creates international order atomically with exact quote snapshot verification', async () => {
      const quote = await CheckoutQuoteService.generateQuote({
        userId: customerUser._id,
        items: [{ productId: String(testProduct._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Hamad Al-Maktoum',
          address: 'Sheikh Zayed Road, Floor 14',
          city: 'Dubai',
          province: 'Dubai',
          countryCode: 'AE',
          phone: '+971501234567'
        },
        currency: 'AED',
        shippingServiceLevel: 'standard'
      });

      const orderData = {
        items: [{ productId: String(testProduct._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Hamad Al-Maktoum',
          address: 'Sheikh Zayed Road, Floor 14',
          city: 'Dubai',
          province: 'Dubai',
          countryCode: 'AE',
          phone: '+971501234567'
        },
        paymentMethod: 'stripe',
        currency: 'AED',
        shippingServiceLevel: 'standard',
        quoteToken: quote.quoteToken
      };

      const seq = ++sequence;
      const result = await OrderService.createOrder({
        userId: customerUser._id,
        orderData,
        idempotencyKey: `IDEMP-P6D3-GOV-${seq}`
      });
      const order = result.order || result;

      expect(order).toBeDefined();
      expect(order.orderId).toMatch(/^ORD-/);
      expect(order.shippingCost).toBe(35);
      expect(order.quote.quoteId).toBe(quote.quoteId);
      expect(order.quote.incoterm).toBe('DDP');
    });
  });

  describe('4. Domestic COD Backward Compatibility', () => {
    it('4.1 successfully creates domestic COD order without requiring quoteToken', async () => {
      const orderData = {
        items: [{ productId: String(testProduct._id), quantity: 2 }],
        shippingAddress: {
          fullName: 'Zainab Bibi',
          address: 'Gulberg III, Main Boulevard',
          city: 'Lahore',
          province: 'Punjab',
          countryCode: 'PK',
          phone: '+923001234567'
        },
        paymentMethod: 'cod',
        currency: 'PKR'
      };

      const seq = ++sequence;
      const result = await OrderService.createOrder({
        userId: customerUser._id,
        orderData,
        idempotencyKey: `IDEMP-P6D3-COD-GOV-${seq}`
      });
      const order = result.order || result;

      expect(order).toBeDefined();
      expect(order.paymentMethod).toBe('cod');
      expect(order.shippingCost).toBe(250);
      expect(order.totalAmount).toBe(2250);
    });
  });

  describe('5. Return & Refund Isolation', () => {
    it('5.1 isolates non-refundable shipping fee from refundable merchandise pool', () => {
      const mockOrder = {
        currency: 'AED',
        totalAmount: 145,
        totalAmountExact: { amountMinor: '14500', currency: 'AED', exponent: 2 },
        shippingCost: 35,
        shippingCostExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
        taxAmount: 10,
        taxAmountExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            price: 100,
            lineTotal: 100,
            lineTotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 }
          }
        ]
      };

      const allocation = ReturnMoneyAllocationService.allocateOrderMerchandise(mockOrder);

      expect(allocation.allocatableMinor).toBe(10000);
      expect(allocation.lines).toHaveLength(1);
      expect(allocation.lines[0].refundableMinor).toBe(10000);
    });
  });

  afterAll(async () => {
    await CommerceConfigurationVersion.deleteMany({});
  });
});

/**
 * @file phase6d3-shipping-fulfillment-routing.integration.test.js
 * @description Integration tests for Phase 6D-3 Global Shipping Rules, Multi-Service Rate Calculation,
 * Fulfillment Routing, Zero-Write Serviceability, and Order Landed-Cost Snapshot Integrity.
 */

const mongoose = require('mongoose');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Order = require('../../models/Order');
const ShippingZone = require('../../models/ShippingZone');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const CommerceConfigurationSequence = require('../../models/CommerceConfigurationSequence');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryLedger = require('../../models/InventoryLedger');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const CheckoutQuoteService = require('../../services/checkout/CheckoutQuoteService');
const OrderService = require('../../services/order/OrderService');
const ReturnMoneyAllocationService = require('../../services/ReturnMoneyAllocationService');
const { Money, MoneyMapper } = require('../../modules/commerce');

let sequence = 100;

describe('Phase 6D-3: Shipping & Fulfillment Routing Integration Tests', () => {
  let customerUser;
  let testCategory;
  let testProduct;
  let activeConfigDoc;
  let fulfillmentLocation;

  beforeEach(async () => {
    // Clean collections
    await User.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Order.deleteMany({});
    await ShippingZone.deleteMany({});
    await CommerceConfigurationVersion.deleteMany({});
    await CommerceConfigurationSequence.deleteMany({});
    await FulfillmentLocation.deleteMany({});
    await InventoryPosition.deleteMany({});
    await InventoryReservation.deleteMany({});
    await InventoryLedger.deleteMany({});
    await ProductMarketOffering.deleteMany({});
    await MarketPriceBook.deleteMany({});

    // Create Customer
    customerUser = await User.create({
      fullName: 'Global Test Customer',
      email: `customer-p6d3-${Date.now()}@example.com`,
      password: 'StrongPassword123!',
      role: 'customer',
      residenceCountry: 'PK'
    });

    // Create Category
    testCategory = await Category.create({
      name: 'Organic Dry Fruits',
      slug: `organic-dry-fruits-${Date.now()}`,
      isActive: true
    });

    // Create Product
    testProduct = await Product.create({
      name: 'Royal Afghan Figs 500g',
      slug: `royal-afghan-figs-500g-${Date.now()}`,
      category: testCategory._id,
      price: 2500,
      stock: 100,
      weight: 0.5,
      weightGrams: 500,
      status: 'published',
      isActive: true,
      countryOfOrigin: 'PK',
      hsClassification: {
        code: '080420',
        systemVersion: 'HS_2022',
        jurisdiction: 'WCO'
      },
      declaredValueEligibility: 'ELIGIBLE',
      dangerousGoodsClassification: 'NOT_RESTRICTED',
      sku: `FIG-500-${Date.now()}`
    });

    // Create Governed Active Configuration
    activeConfigDoc = await CommerceConfigurationVersion.create({
      merchantScopeId: 'default',
      version: 1,
      lockVersion: 1,
      status: 'active',
      merchantProfile: {
        merchantCountry: 'PK',
        legalName: 'MevaPur Global Commerce Corp',
        sellingMode: 'hybrid',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        enabledCurrencies: ['PKR', 'USD', 'AED'],
        enabledCountries: ['PK', 'AE', 'US'],
        defaultLocale: 'en-PK',
        defaultTimeZone: 'Asia/Karachi',
        fulfillmentOrigins: [
          {
            originId: 'ORIGIN-PK-HQ',
            name: 'MevaPur Karachi Central Logistics',
            country: 'PK',
            city: 'Karachi',
            timeZone: 'Asia/Karachi',
            enabled: true,
            isDefault: true
          }
        ],
        supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
        taxCalculationMode: 'exact_rational'
      },
      shippingRules: [
        {
          ruleId: 'SHIP-PK-STD-01',
          name: 'Pakistan Standard Ground',
          serviceCode: 'standard',
          displayName: 'Pakistan Standard Courier (2-4 Days)',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
          freeShippingThresholdExact: { amountMinor: '500000', currency: 'PKR', exponent: 2 },
          remoteRateExact: { amountMinor: '45000', currency: 'PKR', exponent: 2 },
          remoteCities: ['Gwadar', 'Skardu'],
          deliveryMinDays: 2,
          deliveryMaxDays: 4,
          remoteDeliveryMinDays: 5,
          remoteDeliveryMaxDays: 8,
          priority: 100,
          supportedIncoterms: ['DOMESTIC'],
          enabled: true
        },
        {
          ruleId: 'SHIP-PK-EXP-01',
          name: 'Pakistan Express Courier',
          serviceCode: 'express',
          displayName: 'Pakistan Next-Day Express (1-2 Days)',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: { amountMinor: '50000', currency: 'PKR', exponent: 2 },
          deliveryMinDays: 1,
          deliveryMaxDays: 2,
          priority: 50,
          supportedIncoterms: ['DOMESTIC'],
          enabled: true
        },
        {
          ruleId: 'SHIP-AE-STD-01',
          name: 'UAE Cross-Border Standard',
          serviceCode: 'standard',
          displayName: 'Aramex UAE Ground (3-5 Days)',
          originCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
          deliveryMinDays: 3,
          deliveryMaxDays: 5,
          priority: 100,
          supportedIncoterms: ['DDP'],
          enabled: true
        },
        {
          ruleId: 'SHIP-AE-EXP-01',
          name: 'UAE Priority Express',
          serviceCode: 'express',
          displayName: 'DHL Express UAE (1-2 Days)',
          originCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: { amountMinor: '7000', currency: 'AED', exponent: 2 },
          deliveryMinDays: 1,
          deliveryMaxDays: 2,
          priority: 50,
          supportedIncoterms: ['DDP'],
          enabled: true
        }
      ],
      taxRules: [
        {
          ruleId: 'TAX-PK-01',
          destinationCountry: 'PK',
          taxType: 'EXEMPT',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal',
          taxRateNumerator: 0,
          taxRateDenominator: 10000,
          incoterm: 'DOMESTIC',
          sourceAuthority: 'FBR Pakistan General Sales Tax Act',
          sourceReference: 'FBR-2026-NUTS-EXEMPT',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          requiresTax: false,
          requiresDuty: false,
          enabled: true
        },
        {
          ruleId: 'TAX-AE-01',
          destinationCountry: 'AE',
          taxType: 'VAT',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal_shipping',
          taxRateNumerator: 500, // 5% VAT
          taxRateDenominator: 10000,
          dutyRateNumerator: 500, // 5% DDP Duty
          dutyRateDenominator: 10000,
          incoterm: 'DDP',
          sourceAuthority: 'Federal Tax Authority UAE',
          sourceReference: 'FTA-VAT-2026-DDP',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          requiresTax: true,
          requiresDuty: true,
          enabled: true
        }
      ],
      effectiveFrom: new Date(Date.now() - 3600000),
      changeNotes: 'Phase 6D-3 Test Governance Baseline'
    });

    // Create Fulfillment Location
    fulfillmentLocation = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: 'WH-KHI-MAIN',
      displayName: 'Karachi Central Depot',
      name: 'Karachi Central Depot',
      type: 'warehouse',
      countryCode: 'PK',
      city: 'Karachi',
      timeZone: 'Asia/Karachi',
      supportedMarketCountries: ['PK', 'AE', 'US'],
      supportedServiceLevels: ['standard', 'express'],
      isDefault: true,
      priority: 10,
      status: 'active'
    });

    // Create Inventory Position
    await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: fulfillmentLocation._id,
      locationCode: 'WH-KHI-MAIN',
      productId: testProduct._id,
      scopeType: 'product',
      scopeKey: 'product',
      canonicalSku: testProduct.sku,
      onHand: 100,
      reserved: 0,
      unavailable: 0,
      safetyStock: 0,
      lockVersion: 1
    });

    // Create Market Price Book & Offerings for PK and AE
    await ProductMarketOffering.create([
      {
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        pricingPolicy: 'inherit_product_price',
        effectiveFrom: new Date(Date.now() - 3600000)
      },
      {
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'AE',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'cross_border',
        pricingPolicy: 'inherit_product_price',
        effectiveFrom: new Date(Date.now() - 3600000)
      }
    ]);

    await MarketPriceBook.create([
      {
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        currency: 'PKR',
        amountMinor: 250000, // 2,500 PKR
        status: 'active',
        effectiveFrom: new Date(Date.now() - 3600000)
      },
      {
        merchantScopeId: 'default',
        productId: testProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'AE',
        currency: 'AED',
        amountMinor: 4000, // 40.00 AED
        status: 'active',
        effectiveFrom: new Date(Date.now() - 3600000)
      }
    ]);
  });

  describe('1. Zero-Write Public Quote / Serviceability Boundary', () => {
    it('1.1 Generates quote with zero persistent database mutations across all collections', async () => {
      // Capture document counts across collections
      const initialCounts = {
        orders: await Order.countDocuments(),
        reservations: await InventoryReservation.countDocuments(),
        ledgers: await InventoryLedger.countDocuments(),
        positions: await InventoryPosition.countDocuments(),
        zones: await ShippingZone.countDocuments(),
        configs: await CommerceConfigurationVersion.countDocuments()
      };

      const quote = await CheckoutQuoteService.generateQuote({
        userId: customerUser._id,
        items: [{ productId: String(testProduct._id), quantity: 2 }],
        shippingAddress: {
          fullName: 'Ali Khan',
          address: 'Main Boulevard, Gulberg III',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          countryCode: 'PK',
          phone: '+923001234567'
        },
        currency: 'PKR',
        shippingServiceLevel: 'standard'
      });

      expect(quote).toBeDefined();
      expect(quote.quoteId).toMatch(/^QUO-/);
      expect(quote.shipping.selectedOption.amount).toBe(0); // 5000 PKR subtotal >= 5000 threshold
      expect(quote.shipping.selectedOption.freeShippingApplied).toBe(true);
      expect(quote.shipping.availableOptions).toHaveLength(2); // standard and express

      // Verify zero writes occurred
      const finalCounts = {
        orders: await Order.countDocuments(),
        reservations: await InventoryReservation.countDocuments(),
        ledgers: await InventoryLedger.countDocuments(),
        positions: await InventoryPosition.countDocuments(),
        zones: await ShippingZone.countDocuments(),
        configs: await CommerceConfigurationVersion.countDocuments()
      };

      expect(finalCounts).toEqual(initialCounts);
    });
  });

  describe('2. Multi-Service Shipping Option Quoting & Selection', () => {
    it('2.1 Correctly quotes Express option with higher rate and faster delivery', async () => {
      const quote = await CheckoutQuoteService.generateQuote({
        userId: customerUser._id,
        items: [{ productId: String(testProduct._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Rashid Mahmood',
          address: 'Al-Wasl Road',
          city: 'Dubai',
          province: 'Dubai',
          countryCode: 'AE',
          phone: '+971501234567'
        },
        currency: 'AED',
        shippingServiceLevel: 'express'
      });

      expect(quote.shipping.selectedOption.serviceLevel).toBe('express');
      expect(quote.shipping.selectedOption.amount).toBe(70);
      expect(quote.shipping.selectedOption.deliveryEstimate.maxDays).toBe(2);

      // Verify available options contains both standard (35 AED) and express (70 AED)
      const options = quote.shipping.availableOptions;
      expect(options).toHaveLength(2);
      const std = options.find((o) => o.serviceLevel === 'standard');
      const exp = options.find((o) => o.serviceLevel === 'express');
      expect(std.amount).toBe(35);
      expect(exp.amount).toBe(70);
    });
  });

  describe('3. Order Creation Landed-Cost Snapshot & Quote Revalidation', () => {
    it('3.1 Creates international order atomically with exact quote snapshot verification', async () => {
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
        idempotencyKey: `IDEMP-P6D3-ORDER-${seq}`
      });
      const order = result.order || result;

      expect(order).toBeDefined();
      expect(order.orderId).toMatch(/^ORD-/);
      expect(order.shippingCost).toBe(35);
      expect(order.shippingCostExact.amountMinor.toString()).toBe('3500');
      expect(order.shippingQuote.ruleId).toBe('SHIP-AE-STD-01');
      expect(order.shippingQuote.zoneName).toContain('Aramex UAE Ground');
      expect(order.quote.quoteId).toBe(quote.quoteId);
      expect(order.quote.incoterm).toBe('DDP');
    });

    it('3.2 Rejects order creation if shipping service level is modified after quote signature', async () => {
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
        shippingServiceLevel: 'standard' // Signed for Standard (35 AED)
      });

      const tamperedOrderData = {
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
        shippingServiceLevel: 'express', // Tampered to Express (70 AED)
        quoteToken: quote.quoteToken
      };

      const seq = ++sequence;
      await expect(
        OrderService.createOrder({
          userId: customerUser._id,
          orderData: tamperedOrderData,
          idempotencyKey: `IDEMP-P6D3-TAMPER-${seq}`
        })
      ).rejects.toThrow('Order payable total does not match authoritative quote total');
    });
  });

  describe('4. Domestic COD Backward Compatibility', () => {
    it('4.1 Successfully creates domestic COD order without requiring a quoteToken', async () => {
      const seq = ++sequence;
      const result = await OrderService.createOrder({
        userId: customerUser._id,
        orderData: {
          items: [{ productId: String(testProduct._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Zainab Bibi',
            address: 'F-7 Markaz, Islamabad',
            city: 'Islamabad',
            province: 'Federal Capital',
            postalCode: '44000',
            countryCode: 'PK',
            phone: '+923009876543'
          },
          paymentMethod: 'cod',
          currency: 'PKR',
          shippingServiceLevel: 'standard'
        },
        idempotencyKey: `IDEMP-P6D3-COD-${seq}`
      });
      const order = result.order || result;

      expect(order).toBeDefined();
      expect(order.paymentMethod).toBe('cod');
      expect(order.shippingCost).toBe(250);
      expect(order.shippingCostExact.amountMinor.toString()).toBe('25000');
    });
  });

  describe('5. Return & Refund Non-Refundable Shipping Fee Isolation', () => {
    it('5.1 Proves ReturnMoneyAllocationService isolates shippingCost from refundable merchandise pool', () => {
      const mockOrder = {
        currency: 'PKR',
        totalAmount: 5250,
        totalAmountExact: { amountMinor: '525000', currency: 'PKR', exponent: 2 },
        shippingCost: 250,
        shippingCostExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
        taxAmount: 0,
        taxAmountExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            quantity: 2,
            price: 2500,
            lineTotal: 5000,
            lineTotalExact: { amountMinor: '500000', currency: 'PKR', exponent: 2 }
          }
        ]
      };

      const allocation = ReturnMoneyAllocationService.allocateOrderMerchandise(mockOrder);

      // Total merchandise paid is 5,000 (5250 total - 250 shipping).
      expect(allocation.allocatableMinor).toBe(500000);
      expect(allocation.lines).toHaveLength(1);
      expect(allocation.lines[0].refundableMinor).toBe(500000);
    });
  });
});

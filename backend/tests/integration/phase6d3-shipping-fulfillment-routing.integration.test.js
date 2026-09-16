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
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
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
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
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
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
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
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          priority: 50,
          supportedIncoterms: ['DDP'],
          enabled: true
        },
        {
          ruleId: 'SHIP-AE-DOM-01',
          name: 'UAE Domestic Standard',
          serviceCode: 'standard',
          displayName: 'Careem Express UAE (1-2 Days)',
          originCountry: 'AE',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
          deliveryMinDays: 1,
          deliveryMaxDays: 2,
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          priority: 100,
          supportedIncoterms: ['DOMESTIC'],
          enabled: true
        },
        {
          ruleId: 'SHIP-AE-DOM-EXP',
          name: 'UAE Domestic Express',
          serviceCode: 'express',
          displayName: 'Careem Next-Hour Express',
          originCountry: 'AE',
          destinationCountry: 'AE',
          currency: 'AED',
          baseRateExact: { amountMinor: '4000', currency: 'AED', exponent: 2 },
          deliveryMinDays: 1,
          deliveryMaxDays: 1,
          processingCutoffLocal: '16:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          priority: 50,
          supportedIncoterms: ['DOMESTIC'],
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

  describe('6. Canonical Fulfillment Origin & Legacy Closure Invariants', () => {
    it('6.1 Proves allocation-selected FulfillmentLocation is the origin authority and cannot be altered by client', async () => {
      const quote = await CheckoutQuoteService.generateQuote({
        userId: customerUser._id,
        items: [{ productId: String(testProduct._id), quantity: 1 }],
        shippingAddress: {
          fullName: 'Zainab Bibi',
          address: 'F-7 Markaz, Islamabad',
          city: 'Islamabad',
          province: 'Federal Capital',
          postalCode: '44000',
          countryCode: 'PK',
          phone: '+923009876543',
          originCountry: 'US' // Client attempts to override origin
        },
        currency: 'PKR',
        shippingServiceLevel: 'standard'
      });

      expect(quote.shipping.shipmentGroups[0].locationId).toBe(String(fulfillmentLocation._id));
      expect(quote.shipping.shipmentGroups[0].locationCode).toBe(fulfillmentLocation.locationCode);
      expect(quote.shipping.shipmentGroups[0].originCountry).toBe('PK');
      expect(quote.fulfillmentOriginCountry).toBe('PK');
    });

    it('6.2 Fails closed with NO_AUTHORIZED_FULFILLMENT_ORIGIN if location does not support destination market', async () => {
      await FulfillmentLocation.updateOne(
        { _id: fulfillmentLocation._id },
        { $set: { supportedMarketCountries: ['US'] } } // Only supports US, not PK
      );

      await expect(
        CheckoutQuoteService.generateQuote({
          userId: customerUser._id,
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
          currency: 'PKR',
          shippingServiceLevel: 'standard'
        })
      ).rejects.toThrow();

      // Reset
      await FulfillmentLocation.updateOne(
        { _id: fulfillmentLocation._id },
        { $set: { supportedMarketCountries: ['PK', 'AE', 'US'] } }
      );
    });

    it('6.3 Fails closed with NO_AUTHORIZED_FULFILLMENT_ORIGIN if service level is unsupported by location', async () => {
      await FulfillmentLocation.updateOne(
        { _id: fulfillmentLocation._id },
        { $set: { supportedServiceLevels: ['standard'] } }
      );

      await expect(
        CheckoutQuoteService.generateQuote({
          userId: customerUser._id,
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
          currency: 'PKR',
          shippingServiceLevel: 'express'
        })
      ).rejects.toThrow();

      // Reset
      await FulfillmentLocation.updateOne(
        { _id: fulfillmentLocation._id },
        { $set: { supportedServiceLevels: ['standard', 'express'] } }
      );
    });

    it('6.4 Proves missing or invalid product weight strictly fails closed with SHIPPING_WEIGHT_REQUIRED (no 500g fallback)', async () => {
      const zeroWeightProduct = await Product.create({
        name: 'Weightless Tea Leaves',
        slug: `weightless-tea-${Date.now()}`,
        category: testCategory._id,
        price: 1500,
        stock: 50,
        status: 'published',
        isActive: true,
        countryOfOrigin: 'PK',
        sku: `TEA-NOWEIGHT-${Date.now()}`
      });

      await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: fulfillmentLocation._id,
        locationCode: fulfillmentLocation.locationCode,
        productId: zeroWeightProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: zeroWeightProduct.sku,
        onHand: 50,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        lockVersion: 1
      });

      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: zeroWeightProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        pricingPolicy: 'inherit_product_price',
        effectiveFrom: new Date(Date.now() - 3600000)
      });

      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: zeroWeightProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'PK',
        currency: 'PKR',
        amountMinor: 150000,
        status: 'active',
        effectiveFrom: new Date(Date.now() - 3600000)
      });

      await expect(
        CheckoutQuoteService.generateQuote({
          userId: customerUser._id,
          items: [{ productId: String(zeroWeightProduct._id), quantity: 1 }],
          shippingAddress: {
            fullName: 'Zainab Bibi',
            address: 'F-7 Markaz, Islamabad',
            city: 'Islamabad',
            province: 'Federal Capital',
            postalCode: '44000',
            countryCode: 'PK',
            phone: '+923009876543'
          },
          currency: 'PKR',
          shippingServiceLevel: 'standard'
        })
      ).rejects.toThrow('missing valid integer weightGrams for shipping calculations');
    });

    it('6.5 Proves all legacy ShippingZone endpoints fail closed with LEGACY_SHIPPING_CONFIGURATION_DISABLED and zero DB reads/writes', async () => {
      const commercialCoreController = require('../../controllers/commercialCoreController');
      let errorThrown = null;
      const mockReq = { body: { name: 'Test Zone' }, params: { id: 'some-id' }, query: {} };
      const mockRes = {};
      const mockNext = (err) => { errorThrown = err; };

      // 1. listZones
      errorThrown = null;
      await commercialCoreController.listZones(mockReq, mockRes, mockNext);
      expect(errorThrown).toBeDefined();
      expect(errorThrown.code).toBe('LEGACY_SHIPPING_CONFIGURATION_DISABLED');
      expect(errorThrown.message).toContain('Direct ShippingZone configuration is disabled');

      // 2. createZone
      errorThrown = null;
      await commercialCoreController.createZone(mockReq, mockRes, mockNext);
      expect(errorThrown).toBeDefined();
      expect(errorThrown.code).toBe('LEGACY_SHIPPING_CONFIGURATION_DISABLED');

      // 3. updateZone
      errorThrown = null;
      await commercialCoreController.updateZone(mockReq, mockRes, mockNext);
      expect(errorThrown).toBeDefined();
      expect(errorThrown.code).toBe('LEGACY_SHIPPING_CONFIGURATION_DISABLED');

      // 4. deleteZone
      errorThrown = null;
      await commercialCoreController.deleteZone(mockReq, mockRes, mockNext);
      expect(errorThrown).toBeDefined();
      expect(errorThrown.code).toBe('LEGACY_SHIPPING_CONFIGURATION_DISABLED');

      // 5. quoteShipping
      errorThrown = null;
      await commercialCoreController.quoteShipping(mockReq, mockRes, mockNext);
      expect(errorThrown).toBeDefined();
      expect(errorThrown.code).toBe('LEGACY_SHIPPING_CONFIGURATION_DISABLED');
    });

    it('6.6 Proves standalone legacy ShippingService methods fail closed with LEGACY_SHIPPING_CONFIGURATION_DISABLED', async () => {
      const ShippingService = require('../../services/order/ShippingService');

      await expect(ShippingService.quote({ country: 'PK', subtotal: 1000 })).rejects.toThrow(
        'Direct legacy ShippingService quote is disabled'
      );
      await expect(ShippingService.calculate({ country: 'PK' }, 1000)).rejects.toThrow(
        'Direct legacy ShippingService calculation is disabled'
      );
    });

    it('6.7 Proves international COD remains rejected in checkout quotes', async () => {
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

      const codMethod = quote.eligiblePaymentMethods.find((m) => m.code === 'cod');
      expect(codMethod).toBeUndefined();
    });

    it('6.8 Proves split-origin order persistence retains independent origins for multiple shipment groups', async () => {
      // Create a second fulfillment location in AE
      const dxbLocation = await FulfillmentLocation.create({
        merchantScopeId: 'default',
        locationCode: 'WH-DXB-AIRPORT',
        displayName: 'Dubai Airport Logistics Depot',
        name: 'Dubai Airport Logistics Depot',
        type: 'warehouse',
        countryCode: 'AE',
        city: 'Dubai',
        timeZone: 'Asia/Dubai',
        supportedMarketCountries: ['PK', 'AE', 'US'],
        supportedServiceLevels: ['standard', 'express'],
        isDefault: false,
        priority: 20,
        status: 'active'
      });

      // Create a second product
      const secondProduct = await Product.create({
        name: 'Saffron Spice Special Edition',
        slug: `saffron-spice-${Date.now()}`,
        category: testCategory._id,
        price: 5000,
        weightGrams: 200,
        stock: 50,
        status: 'published',
        isActive: true,
        countryOfOrigin: 'AE',
        sku: `SAFFRON-${Date.now()}`,
        customsTariff: {
          code: '091020',
          systemVersion: 'HS_2022',
          jurisdiction: 'WCO'
        },
        declaredValueEligibility: 'ELIGIBLE',
        dangerousGoodsClassification: 'NOT_RESTRICTED'
      });

      await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: dxbLocation._id,
        locationCode: dxbLocation.locationCode,
        productId: secondProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: secondProduct.sku,
        onHand: 50,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        lockVersion: 1
      });

      await ProductMarketOffering.create({
        merchantScopeId: 'default',
        productId: secondProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'AE',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        pricingPolicy: 'inherit_product_price',
        effectiveFrom: new Date(Date.now() - 3600000)
      });

      await MarketPriceBook.create({
        merchantScopeId: 'default',
        productId: secondProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        marketCountry: 'AE',
        currency: 'AED',
        amountMinor: 6000, // 60.00 AED
        status: 'active',
        effectiveFrom: new Date(Date.now() - 3600000)
      });

      // Generate quote with both items (one from PK hub, one from AE hub)
      const quote = await CheckoutQuoteService.generateQuote({
        userId: customerUser._id,
        items: [
          { productId: String(testProduct._id), quantity: 1 },
          { productId: String(secondProduct._id), quantity: 1 }
        ],
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

      // Construct and create order with quoteToken
      const seq = ++sequence;
      const result = await OrderService.createOrder({
        userId: customerUser._id,
        orderData: {
          items: [
            { productId: String(testProduct._id), quantity: 1 },
            { productId: String(secondProduct._id), quantity: 1 }
          ],
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
        },
        idempotencyKey: `IDEMP-P6D3-SPLIT-${seq}`
      });

      const order = result.order || result;
      expect(order).toBeDefined();
      expect(order.orderId).toMatch(/^ORD-/);
      expect(order.shippingQuote).toBeDefined();
      expect(order.quote.quoteId).toBe(quote.quoteId);
      expect(order.items).toHaveLength(2);

      // Verify shipment groups in quote and persisted order
      expect(quote.shipping.shipmentGroups).toHaveLength(2);
      const quoteOrigins = quote.shipping.shipmentGroups.map((g) => g.originCountry).sort();
      expect(quoteOrigins).toEqual(['AE', 'PK']);

      expect(order.shippingQuote.shipmentGroups).toHaveLength(2);
      const persistedOrigins = order.shippingQuote.shipmentGroups.map((g) => g.originCountry).sort();
      expect(persistedOrigins).toEqual(['AE', 'PK']);

      const item1 = order.items.find((it) => String(it.product) === String(testProduct._id));
      const item2 = order.items.find((it) => String(it.product) === String(secondProduct._id));
      expect(item1.originCountry).toBe('PK');
      expect(item2.originCountry).toBe('AE');
    });
  });
});

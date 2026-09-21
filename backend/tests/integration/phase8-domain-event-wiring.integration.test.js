/**
 * @file phase8-domain-event-wiring.integration.test.js
 * @description Integration tests verifying that real domain events across
 * OrderService, PaymentWebhookProcessor, RefundService, ReturnService, and
 * PaymentDisputeService authoritatively trigger outbox notifications, documents,
 * and exception records.
 */

'use strict';

const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const Return = require('../../models/Return');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const MarketPriceBook = require('../../models/MarketPriceBook');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const { MoneyMapper } = require('../../modules/commerce');
const TransactionalMessage = require('../../models/TransactionalMessage');
const OrderDocument = require('../../models/OrderDocument');
const CustomerOperationException = require('../../models/CustomerOperationException');

const orderService = require('../../services/order/OrderService');
const paymentWebhookProcessor = require('../../services/payment/webhooks/PaymentWebhookProcessor');
const paymentDisputeService = require('../../services/payment/PaymentDisputeService');
const MarketService = require('../../services/MarketService');

const createTestOrder = async ({
  user,
  product,
  orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  paymentMethod = 'stripe',
  paymentStatus = 'Pending',
  orderStatus = 'Pending',
  totalAmount = 50.00,
  shippingAddress = null,
  courierCompany = '',
  trackingNumber = ''
}) => {
  const defaultItems = [{
    product: product._id,
    name: product.name,
    price: totalAmount,
    quantity: 1,
    lineTotal: totalAmount
  }];
  const defaultAddress = {
    fullName: 'Jane Customer',
    phone: '+12025550199',
    address: '123 Test St',
    city: 'Metropolis',
    postalCode: '10001',
    country: 'US',
    countryCode: 'US',
    email: 'jane@example.test'
  };

  return await Order.create({
    user: user._id,
    orderId,
    idempotencyKey: `idemp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    requestHash: `hash-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    items: defaultItems,
    subtotal: totalAmount,
    totalAmount,
    currency: 'USD',
    shippingAddress: { ...defaultAddress, ...(shippingAddress || {}) },
    paymentMethod,
    paymentStatus,
    orderStatus,
    courierCompany,
    trackingNumber,
    statusTimeline: [{
      status: orderStatus,
      actor: user._id,
      actorRole: 'customer',
      timestamp: new Date()
    }]
  });
};

const { createGovernedCommerceConfiguration } = require('../helpers/commerceFixtureHelper');

const createTestPayment = async ({
  user,
  order,
  amount = 50.00,
  currency = 'USD',
  status = 'Pending',
  provider = 'stripe',
  providerPaymentId = `pi_test_${Date.now()}`
}) => {
  return await Payment.create({
    merchantScopeId: 'default',
    user: user._id,
    order: order._id,
    amount,
    currency,
    status,
    provider,
    providerPaymentId,
    capabilitySnapshot: {
      provider,
      environment: 'sandbox',
      accountAlias: 'default'
    },
    idempotencyKey: `idemp-pay-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    providerIdempotencyKey: `prov-idemp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    requestHash: `req-hash-${Date.now()}-${Math.random().toString(36).substring(7)}`
  });
};

describe('Phase 8 — Authoritative Domain Event Wiring Integration Tests', () => {
  let testUser;
  let testAdmin;
  let testProduct;
  let prevCompat;

  beforeAll(async () => {
    prevCompat = process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY;
    process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY = 'true';
  });

  afterAll(async () => {
    process.env.ALLOW_LEGACY_HOME_MARKET_OFFERING_COMPATIBILITY = prevCompat;
  });

  beforeEach(async () => {
    await TransactionalMessage.deleteMany({});
    await OrderDocument.deleteMany({});
    await CustomerOperationException.deleteMany({});
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});
    await Return.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});

    const testCategory = await Category.create({
      name: 'Nuts & Seeds',
      slug: `nuts-seeds-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      isActive: true
    });

    await MarketService.update({
      baseCountry: 'PK',
      baseCurrency: 'PKR',
      enabledCountries: ['PK', 'US', 'GB'],
      enabledCurrencies: ['PKR', 'USD', 'GBP']
    });
    await createGovernedCommerceConfiguration({ merchantScopeId: 'default' });

    testUser = await global.createTestUser({
      email: `phase8-domain-${Date.now()}-${Math.random().toString(36).substring(7)}@example.test`,
      fullName: 'Domain Test User',
      role: 'customer'
    });

    testAdmin = await global.createTestUser({
      email: `phase8-admin-${Date.now()}-${Math.random().toString(36).substring(7)}@example.test`,
      fullName: 'Domain Admin User',
      role: 'admin'
    });

    testProduct = await Product.create({
      name: 'Organic Almonds',
      slug: `organic-almonds-${Date.now()}`,
      description: 'Premium organic almonds',
      price: 25.00,
      weightGrams: 500,
      stockQuantity: 100,
      isActive: true,
      category: testCategory._id
    });

    await ProductMarketOffering.deleteMany({});
    await MarketPriceBook.deleteMany({});

    await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: testProduct._id,
      marketCountry: 'PK',
      status: 'active',
      visibility: 'visible',
      fulfillmentMode: 'local',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    await MarketPriceBook.create({
      merchantScopeId: 'default',
      productId: testProduct._id,
      scopeType: 'product',
      scopeKey: 'product',
      marketCountry: 'PK',
      currency: 'PKR',
      currencyExponent: 2,
      amountMinor: MoneyMapper.fromLegacy(25.00, 'PKR').amountMinor.toString(),
      priceSource: 'manual',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    await FulfillmentLocation.deleteMany({});
    await InventoryPosition.deleteMany({});

    const defaultLocation = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: 'WH-PRIMARY-01',
      displayName: 'Primary Fulfillment Hub',
      status: 'active',
      countryCode: 'PK',
      city: 'Karachi',
      timeZone: 'Asia/Karachi',
      priority: 100,
      supportedMarketCountries: ['PK', 'GB', 'AE', 'US', 'DE'],
      supportedServiceLevels: ['standard', 'express'],
      capabilities: ['local_delivery', 'cross_border'],
      returnCapabilities: ['accept_returns', 'inspection', 'restock'],
      isDefault: true
    });

    await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: defaultLocation._id,
      locationCode: defaultLocation.locationCode,
      productId: testProduct._id,
      scopeType: 'product',
      scopeKey: 'product',
      canonicalSku: testProduct.sku || `PROD-${testProduct._id}`,
      onHand: 100,
      reserved: 0,
      unavailable: 0,
      safetyStock: 0,
      backordered: 0,
      reorderPoint: 5
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('8.1 OrderService.createOrder queues ORDER_CONFIRMATION outbox record and creates document', async () => {
    const orderData = {
      items: [{
        productId: testProduct._id,
        quantity: 2
      }],
      shippingAddress: {
        fullName: 'Jane Customer',
        phone: '+923001234567',
        address: '123 Mall Road',
        city: 'Lahore',
        postalCode: '54000',
        country: 'PK',
        countryCode: 'PK',
        email: 'jane@example.test'
      },
      paymentMethod: 'cod'
    };

    const created = await orderService.createOrder({
      userId: testUser._id,
      orderData,
      idempotencyKey: `idemp-create-${Date.now()}`
    });
    const order = created.order;
    expect(order).toBeDefined();

    const outbox = await TransactionalMessage.findOne({
      domainType: 'order',
      domainId: String(order._id)
    });
    expect(outbox).not.toBeNull();
    expect(outbox.templateId).toBe('ORDER_CONFIRMATION');
    expect(outbox.recipient.email).toBe(testUser.email.toLowerCase());
    expect(outbox.status).toBe('PENDING');

    const doc = await OrderDocument.findOne({
      order: order._id
    });
    expect(doc).not.toBeNull();
    expect(doc.status).toBe('ISSUED');
  });

  it('8.2 OrderService.transitionOrder to Shipped queues SHIPMENT_CREATED outbox record', async () => {
    const order = await createTestOrder({
      user: testUser,
      product: testProduct,
      paymentStatus: 'Paid',
      orderStatus: 'Processing',
      courierCompany: 'DHL Express',
      trackingNumber: 'TRACK-123456'
    });

    await orderService.transitionOrder({
      reference: order._id,
      actor: { id: testAdmin._id, role: 'admin' },
      orderStatus: 'Shipped',
      adminNote: 'Shipped via DHL'
    });

    const outbox = await TransactionalMessage.findOne({
      domainType: 'order',
      domainId: String(order._id),
      templateId: 'SHIPMENT_CREATED'
    });
    expect(outbox).not.toBeNull();
    expect(outbox.payload.trackingNumber).toBe('TRACK-123456');
  });

  it('8.3 OrderService.markCodPaid queues PAYMENT_SUCCEEDED outbox record and issues invoice', async () => {
    const order = await createTestOrder({
      user: testUser,
      product: testProduct,
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      orderStatus: 'Delivered'
    });

    await orderService.markCodPaid({
      reference: order._id,
      actor: { id: testAdmin._id, role: 'admin' },
      adminNote: 'Cash collected by driver'
    });

    const outbox = await TransactionalMessage.findOne({
      domainType: 'payment',
      templateId: 'PAYMENT_SUCCEEDED'
    });
    expect(outbox).not.toBeNull();
    expect(outbox.payload.orderNumber).toBe(order.orderId);

    const doc = await OrderDocument.findOne({
      order: order._id
    });
    expect(doc).not.toBeNull();
    expect(doc.status).toBe('ISSUED');
  });

  it('8.4 PaymentWebhookProcessor on succeeded payment queues PAYMENT_SUCCEEDED and issues invoice', async () => {
    const order = await createTestOrder({
      user: testUser,
      product: testProduct,
      paymentStatus: 'Pending',
      orderStatus: 'Pending',
      totalAmount: 40.00
    });

    const payment = await createTestPayment({
      user: testUser,
      order,
      amount: 40.00,
      currency: 'USD',
      status: 'Pending'
    });

    const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
    await PaymentWebhookEvent.create({
      provider: 'stripe',
      accountAlias: 'default',
      environment: 'sandbox',
      providerEventId: `evt_succ_${Date.now()}`,
      eventType: 'payment_intent.succeeded',
      providerPaymentId: payment.providerPaymentId,
      amountMinor: 4000,
      currency: 'USD',
      payloadHash: 'hash_succ',
      status: 'received',
      nextAttemptAt: new Date(Date.now() - 1000)
    });

    const claimed = await paymentWebhookProcessor.claimEvent({
      leaseId: 'lease_succ',
      leaseDurationMs: 30000
    });
    expect(claimed).not.toBeNull();

    await paymentWebhookProcessor.processClaimedEvent(claimed);

    const outbox = await TransactionalMessage.findOne({
      domainType: 'payment',
      domainId: String(payment._id),
      templateId: 'PAYMENT_SUCCEEDED'
    });
    expect(outbox).not.toBeNull();

    const doc = await OrderDocument.findOne({
      order: order._id
    });
    expect(doc).not.toBeNull();
  });

  it('8.5 PaymentWebhookProcessor on failed payment queues PAYMENT_FAILED and reports exception', async () => {
    const order = await createTestOrder({
      user: testUser,
      product: testProduct,
      paymentStatus: 'Pending',
      orderStatus: 'Pending',
      totalAmount: 45.00
    });

    const payment = await createTestPayment({
      user: testUser,
      order,
      amount: 45.00,
      currency: 'USD',
      status: 'Pending'
    });

    const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
    await PaymentWebhookEvent.create({
      provider: 'stripe',
      accountAlias: 'default',
      environment: 'sandbox',
      providerEventId: `evt_fail_${Date.now()}`,
      eventType: 'payment_intent.payment_failed',
      providerPaymentId: payment.providerPaymentId,
      amountMinor: 4500,
      currency: 'USD',
      payloadHash: 'hash_fail',
      status: 'received',
      nextAttemptAt: new Date(Date.now() - 1000)
    });

    const claimed = await paymentWebhookProcessor.claimEvent({
      leaseId: 'lease_fail',
      leaseDurationMs: 30000
    });
    expect(claimed).not.toBeNull();

    await paymentWebhookProcessor.processClaimedEvent(claimed);

    const outbox = await TransactionalMessage.findOne({
      domainType: 'payment',
      domainId: String(payment._id),
      templateId: 'PAYMENT_FAILED'
    });
    expect(outbox).not.toBeNull();

    const ex = await CustomerOperationException.findOne({
      domainType: 'payment',
      domainId: String(payment._id),
      type: 'PAYMENT_FAILED'
    });
    expect(ex).not.toBeNull();
  });

  it('8.6 PaymentDisputeService.recordOrUpdateDispute queues notification and creates exception', async () => {
    const order = await createTestOrder({
      user: testUser,
      product: testProduct,
      paymentStatus: 'Paid',
      orderStatus: 'Delivered'
    });

    const payment = await createTestPayment({
      user: testUser,
      order,
      amount: 50.00,
      currency: 'USD',
      status: 'Completed'
    });

    await paymentDisputeService.recordOrUpdateDispute({
      providerDisputeId: `dp_test_${Date.now()}`,
      providerPaymentId: payment.providerPaymentId,
      paymentId: payment._id,
      provider: 'stripe',
      amount: 50.00,
      currency: 'USD',
      reason: 'fraudulent'
    });

    const outbox = await TransactionalMessage.findOne({
      domainType: 'payment',
      domainId: String(payment._id),
      templateId: 'DISPUTE_OPENED'
    });
    expect(outbox).not.toBeNull();

    const ex = await CustomerOperationException.findOne({
      domainType: 'payment',
      domainId: String(payment._id),
      errorCode: 'PAYMENT_DISPUTE_OPENED'
    });
    expect(ex).not.toBeNull();
  });
});

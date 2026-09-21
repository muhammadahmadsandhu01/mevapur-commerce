/**
 * @file phase8-document-concurrency.integration.test.js
 * @description Integration and concurrency tests for DocumentService,
 * atomic numbering, race-safe issuance, and customer access isolation.
 */

'use strict';

const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const Product = require('../../models/Product');
const OrderDocument = require('../../models/OrderDocument');
const documentService = require('../../services/document/DocumentService');
const documentClassificationEngine = require('../../services/document/DocumentClassificationEngine');

const createTestOrder = async ({
  user,
  product,
  orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  paymentMethod = 'stripe',
  paymentStatus = 'Paid',
  orderStatus = 'Processing',
  totalAmount = 50.00,
  shippingAddress = null
}) => {
  const defaultItems = [{
    product: product._id,
    name: product.name,
    price: totalAmount,
    quantity: 1,
    lineTotal: totalAmount
  }];
  const defaultAddress = {
    fullName: 'Test User',
    phone: '+12025550199',
    address: '123 Test St',
    city: 'Metropolis',
    postalCode: '10001',
    country: 'US',
    countryCode: 'US',
    email: user.email
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
    statusTimeline: [{
      status: orderStatus,
      actor: user._id,
      actorRole: 'customer',
      timestamp: new Date()
    }]
  });
};

describe('Phase 8 — Document Concurrency & Truthfulness Integration Tests', () => {
  let userA;
  let userB;
  let testProduct;

  beforeEach(async () => {
    await OrderDocument.deleteMany({});
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});
    await Product.deleteMany({});

    userA = await global.createTestUser({
      email: `user-a-${Date.now()}-${Math.random().toString(36).substring(7)}@example.test`,
      fullName: 'User A',
      role: 'customer'
    });

    userB = await global.createTestUser({
      email: `user-b-${Date.now()}-${Math.random().toString(36).substring(7)}@example.test`,
      fullName: 'User B',
      role: 'customer'
    });

    testProduct = await Product.create({
      name: 'Test Almonds',
      slug: `test-almonds-${Date.now()}`,
      description: 'Test product',
      price: 50.00,
      stockQuantity: 100,
      isActive: true,
      category: new mongoose.Types.ObjectId()
    });
  });

  it('8.1 concurrent repeated requests for the same order create exactly one document without error', async () => {
    const order = await createTestOrder({
      user: userA,
      product: testProduct,
      paymentStatus: 'Paid',
      orderStatus: 'Processing',
      totalAmount: 50.00
    });

    // Run 5 simultaneous issuance requests
    const results = await Promise.all([
      documentService.getOrIssueOrderDocument(order._id),
      documentService.getOrIssueOrderDocument(order._id),
      documentService.getOrIssueOrderDocument(order._id),
      documentService.getOrIssueOrderDocument(order._id),
      documentService.getOrIssueOrderDocument(order._id)
    ]);

    // All should succeed and return the exact same document ID
    const firstId = results[0]._id.toString();
    for (const res of results) {
      expect(res._id.toString()).toBe(firstId);
    }

    // Exactly one record should exist in the database
    const count = await OrderDocument.countDocuments({ order: order._id });
    expect(count).toBe(1);
  });

  it('8.2 concurrent requests for different orders receive unique document numbers', async () => {
    const [order1, order2, order3] = await Promise.all([
      createTestOrder({ user: userA, product: testProduct, totalAmount: 10 }),
      createTestOrder({ user: userB, product: testProduct, totalAmount: 20 }),
      createTestOrder({ user: userA, product: testProduct, totalAmount: 30 })
    ]);

    const docs = await Promise.all([
      documentService.getOrIssueOrderDocument(order1._id),
      documentService.getOrIssueOrderDocument(order2._id),
      documentService.getOrIssueOrderDocument(order3._id)
    ]);

    const docNumbers = docs.map((d) => d.documentNumber);
    const uniqueNumbers = new Set(docNumbers);
    expect(uniqueNumbers.size).toBe(3);
  });

  it('8.3 classification classifies paid order truthfully based on seller tax registration', async () => {
    const paidOrder = {
      paymentStatus: 'Paid',
      orderStatus: 'Processing',
      taxAmount: 5.00,
      shippingAddress: { country: 'US', countryCode: 'US' }
    };

    // With tax registration in jurisdiction and tax amount -> TAX_INVOICE
    const withReg = documentClassificationEngine.classifyOrderDocument({
      order: paidOrder,
      merchantConfig: {
        isTaxRegistered: true,
        taxId: 'US-TAX-123456',
        jurisdiction: 'US'
      }
    });
    expect(withReg.documentType).toBe('TAX_INVOICE');
    expect(withReg.isOfficialReceipt).toBe(true);

    // Without tax registration -> COMMERCIAL_INVOICE
    const withoutReg = documentClassificationEngine.classifyOrderDocument({
      order: paidOrder,
      merchantConfig: {
        isTaxRegistered: false,
        taxId: ''
      }
    });
    expect(withoutReg.documentType).toBe('COMMERCIAL_INVOICE');
    expect(withoutReg.isOfficialReceipt).toBe(true);
  });

  it('8.4 credit note issuance is idempotent for refunds', async () => {
    const order = await createTestOrder({
      user: userA,
      product: testProduct,
      paymentStatus: 'Refunded',
      orderStatus: 'Delivered',
      totalAmount: 100.00
    });

    const payment = await Payment.create({
      merchantScopeId: 'default',
      user: userA._id,
      order: order._id,
      amount: 100.00,
      currency: 'USD',
      status: 'Refunded',
      provider: 'stripe',
      providerPaymentId: `pi_test_${Date.now()}`,
      idempotencyKey: `idemp-pay-${Date.now()}`,
      providerIdempotencyKey: `prov-idemp-${Date.now()}`,
      requestHash: `req-hash-${Date.now()}`
    });

    const refund = await Refund.create({
      order: order._id,
      payment: payment._id,
      customer: userA._id,
      processedBy: userA._id,
      provider: 'stripe',
      amount: 100.00,
      currency: 'USD',
      status: 'Completed',
      idempotencyKey: `idemp-ref-${Date.now()}`,
      providerIdempotencyKey: `prov-ref-${Date.now()}`,
      requestHash: `req-hash-ref-${Date.now()}`
    });

    const [cn1, cn2] = await Promise.all([
      documentService.getOrIssueCreditNote(order._id, refund._id),
      documentService.getOrIssueCreditNote(order._id, refund._id)
    ]);

    expect(cn1._id.toString()).toBe(cn2._id.toString());
    expect(cn1.documentType).toBe('CREDIT_NOTE');

    const count = await OrderDocument.countDocuments({ relatedRefundId: refund._id });
    expect(count).toBe(1);
  });
});

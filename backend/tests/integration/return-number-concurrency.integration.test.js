const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const ReturnService = require('../../services/ReturnService');
const Session = require('../../models/Session');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Return = require('../../models/Return');

describe('DEF-13: Concurrency-Safe Return Number Generation Integration Tests', () => {
  let sequence = 0;

  const auth = async (role = 'customer') => {
    sequence += 1;
    const user = await global.createTestUser({
      email: `ret-concurrency-${sequence}-${Date.now()}@example.test`,
      role
    });
    const session = await Session.create({
      user: user._id,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'),
      tokenFamilyId: crypto.randomUUID(),
      isActive: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000)
    });
    return {
      user,
      authorization: `Bearer ${TokenService.generateAccessToken({
        userId: user._id,
        sessionId: session._id,
        tokenVersion: user.tokenVersion
      })}`
    };
  };

  const createTestProduct = async (price = 500) => {
    sequence += 1;
    return Product.create({
      name: `Return Concurrency Product ${sequence}`,
      slug: `return-concurrency-product-${sequence}-${Date.now()}`,
      description: 'Product for testing return number concurrency',
      category: new mongoose.Types.ObjectId(),
      images: ['https://example.com/item.webp'],
      sku: `RET-CONCUR-${sequence}-${Date.now()}`,
      price,
      stock: 100,
      isActive: true
    });
  };

  const createDeliveredOrder = async (user, productDoc) => {
    sequence += 1;
    return Order.create({
      user: user._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      items: [{
        product: productDoc._id,
        name: productDoc.name,
        sku: productDoc.sku,
        price: productDoc.price,
        quantity: 1,
        lineTotal: productDoc.price
      }],
      shippingAddress: {
        fullName: user.fullName || 'Test User',
        phone: '03001234567',
        address: '123 Test Street',
        city: 'Lahore',
        province: 'Punjab',
        postalCode: '54000',
        country: 'PK'
      },
      paymentMethod: 'cod',
      payment: {
        provider: 'Cash on Delivery',
        currency: 'PKR',
        paidAt: new Date()
      },
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
      deliveredAt: new Date(),
      subtotal: productDoc.price,
      shippingCost: 0,
      taxAmount: 0,
      discount: 0,
      totalAmount: productDoc.price,
      payableAmount: productDoc.price,
      statusTimeline: [{
        status: 'Delivered',
        actor: user._id,
        actorRole: 'customer',
        timestamp: new Date()
      }]
    });
  };

  describe('1. Return Number Format & Collision-Resistant Generation', () => {
    it('assigns a newly created return a valid returnNumber matching RET-YYYYMMDD-XXXXXXXXXXXXXXXXXXXX format', async () => {
      const { user } = await auth();
      const productDoc = await createTestProduct(300);
      const orderDoc = await createDeliveredOrder(user, productDoc);

      const created = await Return.create({
        order: orderDoc._id,
        customer: user._id,
        items: [{
          product: productDoc._id,
          name: productDoc.name,
          quantity: 1,
          price: 300,
          reason: 'damaged'
        }],
        refundAmount: 300
      });

      expect(created.returnNumber).toBeDefined();
      expect(typeof created.returnNumber).toBe('string');
      // Format: RET-YYYYMMDD-20HEX (80-bit entropy)
      expect(created.returnNumber).toMatch(/^RET-\d{8}-[A-F0-9]{20}$/);
    });

    it('successfully creates 100 concurrent returns without duplicate-key or race-condition failures', async () => {
      const { user } = await auth();
      const productDoc = await createTestProduct(100);

      // Create 100 unique delivered orders
      const orders = await Promise.all(
        Array.from({ length: 100 }, () => createDeliveredOrder(user, productDoc))
      );

      // Concurrently create 100 return documents
      const createdReturns = await Promise.all(
        orders.map((order) =>
          Return.create({
            order: order._id,
            customer: user._id,
            items: [{
              product: productDoc._id,
              name: productDoc.name,
              quantity: 1,
              price: 100,
              reason: 'not_satisfied'
            }],
            refundAmount: 100
          })
        )
      );

      expect(createdReturns).toHaveLength(100);

      // Verify all 100 have valid return numbers and all are distinct
      const returnNumbers = createdReturns.map((r) => r.returnNumber);
      const uniqueNumbers = new Set(returnNumbers);

      expect(uniqueNumbers.size).toBe(100);
      returnNumbers.forEach((num) => {
        expect(num).toMatch(/^RET-\d{8}-[A-F0-9]{20}$/);
      });
    });
  });

  describe('2. Historical Document Preservation & Immutability', () => {
    it('preserves historical sequential returnNumber (e.g. RET-000001) upon read and subsequent save', async () => {
      const { user } = await auth();
      const productDoc = await createTestProduct(200);
      const orderDoc = await createDeliveredOrder(user, productDoc);

      // Explicitly insert a historical return with legacy sequential format
      const historical = await Return.create({
        returnNumber: 'RET-000001',
        order: orderDoc._id,
        customer: user._id,
        items: [{
          product: productDoc._id,
          name: productDoc.name,
          quantity: 1,
          price: 200,
          reason: 'wrong_item'
        }],
        refundAmount: 200,
        status: 'pending'
      });

      expect(historical.returnNumber).toBe('RET-000001');

      // Update the return status
      historical.status = 'approved';
      await historical.save();

      const reloaded = await Return.findById(historical._id);
      expect(reloaded.returnNumber).toBe('RET-000001');
      expect(reloaded.status).toBe('approved');
    });

    it('enforces schema-level immutability on returnNumber against post-creation mutations', async () => {
      const { user } = await auth();
      const productDoc = await createTestProduct(200);
      const orderDoc = await createDeliveredOrder(user, productDoc);

      const created = await Return.create({
        order: orderDoc._id,
        customer: user._id,
        items: [{
          product: productDoc._id,
          name: productDoc.name,
          quantity: 1,
          price: 200,
          reason: 'damaged'
        }],
        refundAmount: 200
      });

      const originalNumber = created.returnNumber;

      // Attempt to mutate returnNumber directly
      created.returnNumber = 'RET-TAMPERED-001';
      await created.save();

      const reloaded = await Return.findById(created._id);
      expect(reloaded.returnNumber).toBe(originalNumber);
      expect(reloaded.returnNumber).not.toBe('RET-TAMPERED-001');
    });
  });

  describe('3. Service & API Contract Consistency', () => {
    it('CustomerCommerceService and ReturnService expose correct returnNumber in customer response shape', async () => {
      const customerAuth = await auth('customer');
      const productDoc = await createTestProduct(400);
      const orderDoc = await createDeliveredOrder(customerAuth.user, productDoc);

      const createdReturn = await ReturnService.requestCustomerReturn(customerAuth.user._id, {
        orderId: orderDoc._id.toString(),
        refundMethod: 'original_payment',
        customerNotes: 'Defective item',
        items: [{
          productId: productDoc._id.toString(),
          quantity: 1,
          reason: 'damaged'
        }]
      });

      expect(createdReturn.returnNumber).toBeDefined();
      expect(createdReturn.returnNumber).toMatch(/^RET-\d{8}-[A-F0-9]{20}$/);

      // Verify customer account list endpoint
      const listRes = await request(app)
        .get('/api/account/returns')
        .set('Authorization', customerAuth.authorization);

      expect(listRes.status).toBe(200);
      const matched = listRes.body.data.returns.find((r) => String(r.id) === String(createdReturn._id));
      expect(matched).toBeDefined();
      expect(matched.returnNumber).toBe(createdReturn.returnNumber);
    });

    it('prevents customer from overriding returnNumber via request payload', async () => {
      const customerAuth = await auth('customer');
      const productDoc = await createTestProduct(450);
      const orderDoc = await createDeliveredOrder(customerAuth.user, productDoc);

      const createdReturn = await ReturnService.requestCustomerReturn(customerAuth.user._id, {
        orderId: orderDoc._id.toString(),
        returnNumber: 'RET-CLIENT-SUPPLIED-INJECTION',
        refundMethod: 'original_payment',
        items: [{
          productId: productDoc._id.toString(),
          quantity: 1,
          reason: 'damaged'
        }]
      });

      expect(createdReturn.returnNumber).not.toBe('RET-CLIENT-SUPPLIED-INJECTION');
      expect(createdReturn.returnNumber).toMatch(/^RET-\d{8}-[A-F0-9]{20}$/);
    });

    it('maintains single active return eligibility constraint per order (409)', async () => {
      const customerAuth = await auth('customer');
      const productDoc = await createTestProduct(500);
      const orderDoc = await createDeliveredOrder(customerAuth.user, productDoc);

      // First return succeeds
      await ReturnService.requestCustomerReturn(customerAuth.user._id, {
        orderId: orderDoc._id.toString(),
        refundMethod: 'original_payment',
        items: [{
          productId: productDoc._id.toString(),
          quantity: 1,
          reason: 'damaged'
        }]
      });

      // Second return on the same order while active fails with 409 CUSTOMER_RETURN_EXISTS
      await expect(
        ReturnService.requestCustomerReturn(customerAuth.user._id, {
          orderId: orderDoc._id.toString(),
          refundMethod: 'original_payment',
          items: [{
            productId: productDoc._id.toString(),
            quantity: 1,
            reason: 'damaged'
          }]
        })
      ).rejects.toThrow('An active return request already exists for this order');
    });

    it('Admin portal can search and filter returns by returnNumber regex', async () => {
      const adminAuth = await auth('admin');
      const customerAuth = await auth('customer');
      const productDoc = await createTestProduct(350);
      const orderDoc = await createDeliveredOrder(customerAuth.user, productDoc);

      const createdReturn = await ReturnService.requestCustomerReturn(customerAuth.user._id, {
        orderId: orderDoc._id.toString(),
        refundMethod: 'original_payment',
        items: [{
          productId: productDoc._id.toString(),
          quantity: 1,
          reason: 'wrong_item'
        }]
      });

      const searchSubstring = createdReturn.returnNumber.slice(-6);

      const searchRes = await request(app)
        .get(`/api/returns?search=${searchSubstring}`)
        .set('Authorization', adminAuth.authorization);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.length).toBeGreaterThanOrEqual(1);
      const found = searchRes.body.data.find((r) => r.returnNumber === createdReturn.returnNumber);
      expect(found).toBeDefined();
    });
  });
});

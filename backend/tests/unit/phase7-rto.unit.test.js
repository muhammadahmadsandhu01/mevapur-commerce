/**
 * @file phase7-rto.unit.test.js
 * @description Unit tests for Return-To-Origin (RTO) carrier events, inventory restoration, and customer return isolation.
 */

'use strict';

const mongoose = require('mongoose');
const OrderService = require('../../services/order/OrderService');
const ReturnService = require('../../services/ReturnService');
const Order = require('../../models/Order');
const Return = require('../../models/Return');
const Product = require('../../models/Product');
const InventoryTransaction = require('../../models/InventoryTransaction');

describe('Phase 7 — Return-to-Origin (RTO) Lifecycle & Inventory Restoration', () => {
  let product;
  let order;
  const dummyUserId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    product = await Product.create({
      name: 'RTO Test Product',
      slug: `rto-product-${Date.now()}`,
      category: new mongoose.Types.ObjectId(),
      sku: `RTO-SKU-${Date.now()}`,
      price: 2500,
      stock: 10,
      isActive: true
    });

    order = await Order.create({
      orderId: `ORD-RTO-${Date.now()}`,
      user: dummyUserId,
      idempotencyKey: new mongoose.Types.ObjectId().toString(),
      requestHash: 'hash-rto-order',
      items: [{
        product: product._id,
        name: product.name,
        sku: product.sku,
        price: 2500,
        quantity: 2,
        lineTotal: 5000
      }],
      shippingAddress: {
        fullName: 'RTO Customer',
        phone: '03001234567',
        address: '123 RTO Street',
        city: 'Lahore',
        country: 'PK'
      },
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      orderStatus: 'Shipped',
      subtotal: 5000,
      totalAmount: 5000,
      statusTimeline: [{ status: 'Shipped', actor: dummyUserId, actorRole: 'system', timestamp: new Date() }]
    });
  });

  it('processes RTO for a failed delivery and deterministically restores inventory exactly once', async () => {
    const initialStock = product.stock; // 10

    const result = await OrderService.handleReturnToOrigin({
      orderId: order._id,
      carrierEvent: 'DELIVERY_FAILED_CUSTOMER_UNAVAILABLE',
      reason: 'Customer was not available after 3 attempts'
    });

    expect(result.idempotentReplay).toBe(false);
    expect(result.order.isRto).toBe(true);
    expect(result.order.orderStatus).toBe('Cancelled');
    expect(result.order.inventoryRestoredAt).toBeDefined();

    // Check product stock incremented by 2 (10 -> 12)
    const updatedProduct = await Product.findById(product._id);
    expect(updatedProduct.stock).toBe(initialStock + 2);

    // Verify InventoryTransaction recorded
    const tx = await InventoryTransaction.findOne({
      order: order._id,
      type: 'return'
    });
    expect(tx).toBeDefined();
    expect(tx.quantity).toBe(2);
    expect(tx.metadata.isRto).toBe(true);

    // Repeated call is idempotent replay without double-restock
    const replay = await OrderService.handleReturnToOrigin({
      orderId: order._id,
      carrierEvent: 'DELIVERY_FAILED_CUSTOMER_UNAVAILABLE'
    });
    expect(replay.idempotentReplay).toBe(true);

    const productAfterReplay = await Product.findById(product._id);
    expect(productAfterReplay.stock).toBe(initialStock + 2); // Still 12, not 14
  });

  it('rejects RTO processing if order is already Delivered', async () => {
    order.orderStatus = 'Delivered';
    await order.save();

    await expect(OrderService.handleReturnToOrigin({
      orderId: order._id,
      carrierEvent: 'DELIVERY_FAILED'
    })).rejects.toThrow('Delivered orders cannot be processed as RTO');
  });

  it('rejects RTO processing if an active customer return exists', async () => {
    await Return.create({
      order: order._id,
      customer: dummyUserId,
      items: [{
        product: product._id,
        name: product.name,
        quantity: 1,
        price: 2500,
        reason: 'damaged'
      }],
      status: 'pending'
    });

    await expect(OrderService.handleReturnToOrigin({
      orderId: order._id,
      carrierEvent: 'DELIVERY_FAILED'
    })).rejects.toThrow('Active customer return already exists for this order');
  });
});

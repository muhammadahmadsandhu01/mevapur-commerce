const mongoose = require('mongoose');
const OrderService = require('../../services/order/OrderService');
const InventoryReservationService = require('../../services/inventory/InventoryReservationService');
const Product = require('../../models/Product');
const InventoryPosition = require('../../models/InventoryPosition');

async function runTest() {
  await mongoose.connect('mongodb://app_user:app_password@localhost:27017/mevapur-commerce?authSource=mevapur-commerce&replicaSet=rs0&directConnection=true');
  console.log('Connected to MongoDB');

  try {
    // 1. Setup mock product and inventory position
    const product = await Product.create({
      name: 'Test Concurrent Product',
      sku: 'TEST-CONC',
      price: 1000,
      stock: 1, // Visual stock, not authoritative anymore
      soldCount: 0
    });

    const inventoryPosition = await InventoryPosition.create({
      productId: product._id,
      locationId: new mongoose.Types.ObjectId(), // Mock location
      locationCode: 'MAIN-WH',
      quantityOnHand: 1,
      quantityReserved: 0,
      quantityAvailable: 1
    });

    console.log(`Created product ${product._id} with 1 available stock in position ${inventoryPosition._id}`);

    const mockQuoteToken = 'mock-signed-token'; // Bypassing for test or we just mock the verify quote
    // We can mock OrderService's quote verification
    const originalVerify = require('../../services/checkout/CheckoutQuoteService').verifyAndDecodeQuoteToken;
    require('../../services/checkout/CheckoutQuoteService').verifyAndDecodeQuoteToken = () => ({
      merchantScopeId: 'default',
      orderData: { paymentMethod: 'cod' },
      dutiesExact: { amountMinor: 0 },
      taxAmountExact: { amountMinor: 0 },
      discountExact: { amountMinor: 0 },
      shippingCostExact: { amountMinor: 0 },
      subtotalExact: { amountMinor: 1000 },
      totalAmountExact: { amountMinor: 1000 },
      taxDutyResult: { provenance: {} }
    });

    const orderPayload = {
      items: [{ product: product._id, quantity: 1, price: 1000 }],
      paymentMethod: 'cod',
      shippingAddress: { fullName: 'Test', email: 'test@example.com' },
      billingAddress: { fullName: 'Test', email: 'test@example.com' },
      quoteToken: mockQuoteToken
    };

    console.log('Initiating concurrent checkouts...');

    // Attempt 2 concurrent orders
    const results = await Promise.allSettled([
      OrderService.createOrder(orderPayload, new mongoose.Types.ObjectId()),
      OrderService.createOrder(orderPayload, new mongoose.Types.ObjectId())
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    console.log(`Successes: ${successes.length}, Failures: ${failures.length}`);

    if (successes.length === 1 && failures.length === 1) {
      console.log('✅ TEST PASSED: Exactly one order succeeded and one failed (no split-brain overselling).');
    } else {
      console.log('❌ TEST FAILED: Concurrency issue detected.');
    }

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

runTest();

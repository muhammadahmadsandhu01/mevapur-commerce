const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const {
  createAssistantConfig
} = require('../../modules/assistant/config/assistant.config');
const {
  createAssistantRouter
} = require('../../modules/assistant/assistant.routes');
const errorHandler = require('../../middleware/errorHandler');
const tools = require('../../modules/assistant/tools/assistantReadTools');

const retrievalConfig = createAssistantConfig({
  AI_ASSISTANT_ENABLED: 'true',
  AI_ASSISTANT_MODE: 'retrieval',
  AI_MAX_INPUT_CHARS: '200'
});

const createTestApp = () => {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    req.requestId = 'assistant-integration-test';
    next();
  });
  app.use('/api/assistant', createAssistantRouter(retrievalConfig));
  app.use(errorHandler);
  return app;
};

describe('P5C assistant API and role-scoped tools', () => {
  test('publishes anonymous retrieval capabilities', async () => {
    const response = await request(createTestApp())
      .get('/api/assistant/capabilities')
      .expect(200);

    expect(response.body.data).toMatchObject({
      mode: 'retrieval',
      label: 'Help Search',
      readOnly: true,
      audience: 'anonymous',
      historyPersisted: false
    });
    expect(response.body.data.tools).not.toContain('getCurrentCustomerOrders');
  });

  test('answers anonymous public help and supplies sources', async () => {
    const response = await request(createTestApp())
      .post('/api/assistant/chat')
      .send({ message: 'Explain returns and refunds', history: [] })
      .expect(200);

    expect(response.body.data.sources.length).toBeGreaterThan(0);
    expect(response.body.data.tools).toEqual([]);
  });

  test('rejects oversized messages and bounded-history violations', async () => {
    await request(createTestApp())
      .post('/api/assistant/chat')
      .send({ message: 'x'.repeat(201) })
      .expect(400);

    await request(createTestApp())
      .post('/api/assistant/chat')
      .send({
        message: 'shipping',
        history: Array.from({ length: 9 }, () => ({
          role: 'user',
          content: 'bounded'
        }))
      })
      .expect(400);
  });

  test('requires authentication and admin authorization for admin chat', async () => {
    const response = await request(createTestApp())
      .post('/api/assistant/admin/chat')
      .send({ message: 'Inventory overview' })
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_TOKEN_REQUIRED');
  });

  test('customer tools bind queries to the authenticated user ID', async () => {
    const ownUser = new mongoose.Types.ObjectId();
    const otherUser = new mongoose.Types.ObjectId();
    const orders = mongoose.connection.collection('orders');
    await orders.insertMany([
      {
        orderId: 'ORD-20260728-OWN12345',
        user: ownUser,
        orderStatus: 'Pending',
        paymentStatus: 'Pending',
        paymentMethod: 'cod',
        totalAmount: 100,
        createdAt: new Date()
      },
      {
        orderId: 'ORD-20260728-OTHER123',
        user: otherUser,
        orderStatus: 'Paid',
        paymentStatus: 'Paid',
        paymentMethod: 'cod',
        totalAmount: 200,
        createdAt: new Date()
      }
    ]);

    const result = await tools.getCurrentCustomerOrders({
      userId: String(ownUser)
    });
    expect(result).toHaveLength(1);
    expect(result[0].orderId).toBe('ORD-20260728-OWN12345');
    expect(JSON.stringify(result)).not.toContain('OTHER123');
  });

  test('admin tools return aggregates/redacted summaries and expose no writes', async () => {
    const products = mongoose.connection.collection('products');
    await products.insertMany([
      {
        name: 'Low stock item',
        slug: 'low-stock-item',
        description: 'test',
        price: 10,
        stock: 1,
        lowStockThreshold: 2,
        isActive: true
      },
      {
        name: 'Stocked item',
        slug: 'stocked-item',
        description: 'test',
        price: 20,
        stock: 20,
        lowStockThreshold: 2,
        isActive: true
      }
    ]);

    const summary = await tools.getInventorySummary();
    const lowStock = await tools.getLowStockSummary();
    const availability = await tools.getProviderAvailabilitySummary();
    expect(summary).toMatchObject({
      productCount: 2,
      totalUnits: 21,
      lowStockCount: 1
    });
    expect(lowStock).toHaveLength(1);
    expect(lowStock[0]).not.toHaveProperty('description');
    expect(availability.edition).toBe('full');
    expect(JSON.stringify(availability)).not.toMatch(
      /secret|apiKey|publishableKey|accountTitle|publicAccountReference/i
    );
    expect(Object.keys(tools.TOOL_DEFINITIONS).some(
      (name) => /create|update|delete|approve|reject/i.test(name)
    )).toBe(false);
    expect(Object.values(tools.TOOL_DEFINITIONS).every(
      (definition) => definition.readOnly
    )).toBe(true);
  });

  test('rate limiter stops excessive assistant requests', async () => {
    const app = createTestApp();
    for (let index = 0; index < 20; index += 1) {
      await request(app)
        .post('/api/assistant/chat')
        .send({ message: 'shipping' })
        .expect(200);
    }
    await request(app)
      .post('/api/assistant/chat')
      .send({ message: 'shipping' })
      .expect(429);
  });
});

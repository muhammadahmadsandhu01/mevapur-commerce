const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const {
  createAssistantConfig
} = require('../../modules/assistant/config/assistant.config');
const {
  createAssistantRouter
} = require('../../modules/assistant/assistant.routes');
const {
  createKnowledgeLoader
} = require('../../modules/assistant/knowledge/knowledgeIndexLoader');
const errorHandler = require('../../middleware/errorHandler');
const tools = require('../../modules/assistant/tools/assistantReadTools');
const TokenService = require('../../services/TokenService');
const Session = require('../../models/Session');
const authConfig = require('../../config/auth.config');
const ERROR_CODES = require('../../constants/errorCodes');
const { CANONICAL_ROLES } = require('../../constants/roleConstants');

const retrievalConfig = createAssistantConfig({
  AI_ASSISTANT_ENABLED: 'true',
  AI_ASSISTANT_MODE: 'retrieval',
  AI_MAX_INPUT_CHARS: '200'
});

const createTestApp = (options = {}) => {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    req.requestId = 'assistant-integration-test';
    next();
  });
  app.get('/api/health', (req, res) => res.status(200).json({ status: 'OK' }));
  app.use('/api/assistant', createAssistantRouter(retrievalConfig, options));
  app.use(errorHandler);
  return app;
};

let userSequence = 0;

const createAuthenticatedUser = async (role, sessionOverrides = {}) => {
  userSequence += 1;
  const user = await global.createTestUser({
    email: `assistant-auth-${role}-${userSequence}@example.test`,
    role
  });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 3600000),
    ...sessionOverrides
  });
  const token = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion
  });
  return { user, session, token, authorization: `Bearer ${token}` };
};

const createExpiredToken = (user, session) => jwt.sign(
  {
    sub: String(user._id),
    sid: String(session._id),
    jti: crypto.randomUUID(),
    tokenVersion: Number(user.tokenVersion || 0),
    type: 'access'
  },
  authConfig.jwt.secret,
  {
    algorithm: 'HS256',
    expiresIn: -1,
    issuer: authConfig.jwt.issuer,
    audience: authConfig.jwt.audience
  }
);

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
      historyPersisted: false,
      knowledgeAvailable: true
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

  describe('POST /api/assistant/admin/chat authentication and RBAC matrix', () => {
    test('1. denies anonymous request with 401 AUTH_TOKEN_REQUIRED', async () => {
      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .send({ message: 'Inventory overview', history: [] })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_TOKEN_REQUIRED
        }
      });
      expect(response.body.data).toBeUndefined();
    });

    test('2. denies malformed bearer token with 401 AUTH_TOKEN_INVALID', async () => {
      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', 'Bearer invalid-malformed-token-string')
        .send({ message: 'Inventory overview', history: [] })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_TOKEN_INVALID
        }
      });
      expect(response.body.data).toBeUndefined();
    });

    test('3. denies expired token with 401 AUTH_TOKEN_EXPIRED', async () => {
      const { user, session } = await createAuthenticatedUser(
        CANONICAL_ROLES.ADMIN
      );
      const expiredToken = createExpiredToken(user, session);

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ message: 'Inventory overview', history: [] })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_TOKEN_EXPIRED
        }
      });
      expect(response.body.data).toBeUndefined();
    });

    test('4. denies revoked session token with 401 AUTH_SESSION_REVOKED', async () => {
      const { authorization } = await createAuthenticatedUser(
        CANONICAL_ROLES.ADMIN,
        { isRevoked: true }
      );

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'Inventory overview', history: [] })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_SESSION_REVOKED
        }
      });
      expect(response.body.data).toBeUndefined();
    });

    test('5. denies customer role with 403 AUTH_FORBIDDEN', async () => {
      const { authorization } = await createAuthenticatedUser(
        CANONICAL_ROLES.CUSTOMER
      );

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'Inventory overview', history: [] })
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_FORBIDDEN
        }
      });
      expect(response.body.data).toBeUndefined();
    });

    test('6. denies support role with 403 AUTH_FORBIDDEN', async () => {
      const { authorization } = await createAuthenticatedUser(
        CANONICAL_ROLES.SUPPORT
      );

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'Inventory overview', history: [] })
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_FORBIDDEN
        }
      });
      expect(response.body.data).toBeUndefined();
    });

    test('7. denies inventory role with 403 AUTH_FORBIDDEN', async () => {
      const { authorization } = await createAuthenticatedUser(
        CANONICAL_ROLES.INVENTORY
      );

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'Inventory overview', history: [] })
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_FORBIDDEN
        }
      });
      expect(response.body.data).toBeUndefined();
    });

    test('8. denies manager role with 403 AUTH_FORBIDDEN', async () => {
      const { authorization } = await createAuthenticatedUser(
        CANONICAL_ROLES.MANAGER
      );

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'Inventory overview', history: [] })
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_FORBIDDEN
        }
      });
      expect(response.body.data).toBeUndefined();
    });

    test('9. authorizes admin role with 200 and operational intelligence', async () => {
      const { authorization } = await createAuthenticatedUser(
        CANONICAL_ROLES.ADMIN
      );

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'Inventory overview', history: [] })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          mode: 'retrieval',
          label: 'Help Search',
          answer: expect.stringContaining('getInventorySummary'),
          sources: expect.any(Array),
          tools: ['getInventorySummary'],
          criticalNotice: expect.any(String)
        },
        meta: {
          requestId: 'assistant-integration-test'
        }
      });
    });

    test('10. authorizes super_admin role with 200 and operational intelligence', async () => {
      const { authorization } = await createAuthenticatedUser(
        CANONICAL_ROLES.SUPER_ADMIN
      );

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'Inventory overview', history: [] })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          mode: 'retrieval',
          label: 'Help Search',
          answer: expect.stringContaining('getInventorySummary'),
          sources: expect.any(Array),
          tools: ['getInventorySummary'],
          criticalNotice: expect.any(String)
        },
        meta: {
          requestId: 'assistant-integration-test'
        }
      });
    });
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

  describe('Safe degradation on missing or corrupt knowledge index', () => {
    let tempDir;
    let tempCounter = 0;

    beforeEach(() => {
      tempCounter += 1;
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `test-assistant-http-degrade-${tempCounter}-`));
    });

    afterEach(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      jest.restoreAllMocks();
    });

    test('missing index degrades capabilities and returns knowledgeAvailable: false with empty tools', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });

      const capRes = await request(degradedApp)
        .get('/api/assistant/capabilities')
        .expect(200);
      expect(capRes.body.data.knowledgeAvailable).toBe(false);
      expect(capRes.body.data.tools).toEqual([]);
    });

    test('missing index returns 503 for customer general chat', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });

      const chatRes = await request(degradedApp)
        .post('/api/assistant/chat')
        .send({ message: 'Explain returns and refunds', history: [] })
        .expect(503);

      expect(chatRes.body).toEqual({
        success: false,
        error: {
          code: 'ASSISTANT_KNOWLEDGE_UNAVAILABLE',
          message: 'Assistant knowledge is temporarily unavailable. Please try again later or contact support.'
        },
        meta: {
          requestId: 'assistant-integration-test'
        }
      });
      expect(JSON.stringify(chatRes.body)).not.toContain('missing-index.json');
      expect(JSON.stringify(chatRes.body)).not.toContain('stack');
    });

    test('customer product intent returns 503 and executes zero tools', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });
      const spySearch = jest.spyOn(tools, 'searchPublicProducts');

      const chatRes = await request(degradedApp)
        .post('/api/assistant/chat')
        .send({ message: 'find organic almonds', history: [] })
        .expect(503);

      expect(chatRes.body.error.code).toBe('ASSISTANT_KNOWLEDGE_UNAVAILABLE');
      expect(spySearch).not.toHaveBeenCalled();
    });

    test('authenticated customer order intent returns 503 and executes zero tools', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });
      const spyOrders = jest.spyOn(tools, 'getCurrentCustomerOrders');

      const { authorization } = await createAuthenticatedUser(CANONICAL_ROLES.CUSTOMER);

      const chatRes = await request(degradedApp)
        .post('/api/assistant/chat')
        .set('Authorization', authorization)
        .send({ message: 'show my orders', history: [] })
        .expect(503);

      expect(chatRes.body.error.code).toBe('ASSISTANT_KNOWLEDGE_UNAVAILABLE');
      expect(spyOrders).not.toHaveBeenCalled();
    });

    test('authenticated customer payment/refund intent returns 503 and executes zero tools', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });
      const spyPayments = jest.spyOn(tools, 'getCurrentCustomerPaymentStatus');
      const spyRefunds = jest.spyOn(tools, 'getCurrentCustomerRefundStatus');

      const { authorization } = await createAuthenticatedUser(CANONICAL_ROLES.CUSTOMER);

      const payRes = await request(degradedApp)
        .post('/api/assistant/chat')
        .set('Authorization', authorization)
        .send({ message: 'check my payments', history: [] })
        .expect(503);
      expect(payRes.body.error.code).toBe('ASSISTANT_KNOWLEDGE_UNAVAILABLE');
      expect(spyPayments).not.toHaveBeenCalled();

      const refRes = await request(degradedApp)
        .post('/api/assistant/chat')
        .set('Authorization', authorization)
        .send({ message: 'check my refunds', history: [] })
        .expect(503);
      expect(refRes.body.error.code).toBe('ASSISTANT_KNOWLEDGE_UNAVAILABLE');
      expect(spyRefunds).not.toHaveBeenCalled();
    });

    test('valid admin inventory intent returns 503 and executes zero tools', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });
      const spyInventory = jest.spyOn(tools, 'getInventorySummary');

      const { authorization } = await createAuthenticatedUser(CANONICAL_ROLES.ADMIN);

      const response = await request(degradedApp)
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'inventory overview', history: [] })
        .expect(503);

      expect(response.body.error.code).toBe('ASSISTANT_KNOWLEDGE_UNAVAILABLE');
      expect(spyInventory).not.toHaveBeenCalled();
    });

    test('valid super_admin operational intent returns 503 and executes zero tools', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });
      const spyLowStock = jest.spyOn(tools, 'getLowStockSummary');

      const { authorization } = await createAuthenticatedUser(CANONICAL_ROLES.SUPER_ADMIN);

      const response = await request(degradedApp)
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'show low stock products', history: [] })
        .expect(503);

      expect(response.body.error.code).toBe('ASSISTANT_KNOWLEDGE_UNAVAILABLE');
      expect(spyLowStock).not.toHaveBeenCalled();
    });

    test('malformed index returns 503 for admin non-tool chat without leaking parser error', async () => {
      const malformedPath = path.join(tempDir, 'malformed-index.json');
      fs.writeFileSync(malformedPath, '{ broken json syntax', 'utf8');

      const malformedLoader = createKnowledgeLoader({ indexPath: malformedPath });
      const degradedApp = createTestApp({ knowledgeLoader: malformedLoader });

      const { authorization } = await createAuthenticatedUser(CANONICAL_ROLES.ADMIN);

      const response = await request(degradedApp)
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'Explain deployment architecture', history: [] })
        .expect(503);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'ASSISTANT_KNOWLEDGE_UNAVAILABLE',
          message: 'Assistant knowledge is temporarily unavailable. Please try again later or contact support.'
        },
        meta: {
          requestId: 'assistant-integration-test'
        }
      });
      expect(JSON.stringify(response.body)).not.toContain('broken json syntax');
      expect(JSON.stringify(response.body)).not.toContain('SyntaxError');
    });

    test('unrelated routes remain operational when knowledge is unavailable', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });

      const response = await request(degradedApp)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'OK' });
    });

    test('authentication ordering is preserved on admin chat when knowledge is unavailable', async () => {
      const missingLoader = createKnowledgeLoader({
        indexPath: path.join(tempDir, 'missing-index.json')
      });
      const degradedApp = createTestApp({ knowledgeLoader: missingLoader });

      // Unauthenticated request receives 401 AUTH_TOKEN_REQUIRED
      const anonRes = await request(degradedApp)
        .post('/api/assistant/admin/chat')
        .send({ message: 'inventory overview', history: [] })
        .expect(401);

      expect(anonRes.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_TOKEN_REQUIRED
        }
      });

      // Unauthorized customer role receives 403 AUTH_FORBIDDEN
      const { authorization: customerAuth } = await createAuthenticatedUser(CANONICAL_ROLES.CUSTOMER);
      const forbRes = await request(degradedApp)
        .post('/api/assistant/admin/chat')
        .set('Authorization', customerAuth)
        .send({ message: 'inventory overview', history: [] })
        .expect(403);

      expect(forbRes.body).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_FORBIDDEN
        }
      });
    });
  });

  describe('Assistant Evidence Cards and Source Provenance Integration', () => {
    test('knowledge response exposes sanitized, complete knowledge evidence cards with logical provenance', async () => {
      const response = await request(createTestApp())
        .post('/api/assistant/chat')
        .send({ message: 'What is the brand tagline and marketplace identity?', history: [] })
        .expect(200);

      expect(response.body.data.sources.length).toBeGreaterThan(0);
      const firstCard = response.body.data.sources[0];
      expect(firstCard).toMatchObject({
        id: expect.any(String),
        kind: 'knowledge',
        title: expect.any(String),
        category: expect.any(String),
        reference: expect.any(String),
        referenceType: 'logical',
        resolvable: false,
        audience: expect.any(Array),
        snippet: expect.any(String)
      });
      expect(firstCard).not.toHaveProperty('score');
      expect(firstCard.audience).toContain('anonymous');

      const serialized = JSON.stringify(response.body.data.sources);
      expect(serialized).not.toMatch(/[a-zA-Z]:[/\\]/);
      expect(serialized).not.toContain('mongodb://');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('stack');
    });

    test('tool response exposes allowlisted operational tool evidence card without internal function names', async () => {
      const { authorization } = await createAuthenticatedUser(CANONICAL_ROLES.ADMIN);

      const response = await request(createTestApp())
        .post('/api/assistant/admin/chat')
        .set('Authorization', authorization)
        .send({ message: 'inventory overview', history: [] })
        .expect(200);

      expect(response.body.data.sources).toHaveLength(1);
      const toolCard = response.body.data.sources[0];
      expect(toolCard).toEqual({
        id: 'tool:getInventorySummary',
        kind: 'tool',
        title: 'Admin Inventory Summary',
        category: 'operational',
        reference: 'Live role-scoped commerce data',
        referenceType: 'runtime',
        resolvable: false,
        audience: ['admin']
      });
      expect(toolCard).not.toHaveProperty('toolName');
      expect(response.body.data.tools).toEqual(['getInventorySummary']);
    });

    test('insufficient information returns zero evidence cards (no hallucination)', async () => {
      const response = await request(createTestApp())
        .post('/api/assistant/chat')
        .send({ message: 'Explain astronomical astrophysics cosmology', history: [] })
        .expect(200);

      expect(response.body.data.answer).toMatch(/Insufficient information/i);
      expect(response.body.data.sources).toEqual([]);
      expect(response.body.data.tools).toEqual([]);
    });

    test('role-scoped boundaries: anonymous request never receives admin evidence cards', async () => {
      const response = await request(createTestApp())
        .post('/api/assistant/chat')
        .send({ message: 'deployment configuration and server operations', history: [] })
        .expect(200);

      const sources = response.body.data.sources;
      for (const card of sources) {
        expect(card.audience).toContain('anonymous');
        expect(card.audience).not.toEqual(['admin']);
      }
    });
  });
});

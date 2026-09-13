/**
 * @file payment-webhook-ingress.integration.test.js
 * @description Integration tests for Durable Payment Webhook Ingress, Signature Authentication,
 *              Idempotency, and Byte Preservation.
 */

'use strict';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
const StripeProvider = require('../../services/payment/providers/StripeProvider');
const { WEBHOOK_PROCESSING_STATUSES } = require('../../constants/paymentConstants');

describe('Phase 5B: Payment Webhook Ingress Integration Tests', () => {
  const webhookSecret = 'whsec_test_secret_key_12345';

  beforeAll(async () => {
    await PaymentWebhookEvent.syncIndexes();
  });

  beforeEach(async () => {
    await PaymentWebhookEvent.deleteMany({});
  });

  afterEach(() => {
    StripeProvider.resetClientForTests();
  });

  const createSignedStripePayload = ({
    id = `evt_test_${crypto.randomUUID()}`,
    type = 'payment_intent.succeeded',
    paymentIntentId = `pi_${crypto.randomUUID()}`,
    amount = 5000,
    currency = 'usd',
    livemode = false,
    timestamp = Math.floor(Date.now() / 1000),
    secret = webhookSecret
  } = {}) => {
    const payloadObj = {
      id,
      object: 'event',
      api_version: '2020-08-27',
      created: timestamp,
      type,
      livemode,
      data: {
        object: {
          id: paymentIntentId,
          object: 'payment_intent',
          amount,
          amount_received: amount,
          currency,
          status: 'succeeded',
          metadata: {
            paymentId: '660000000000000000000001',
            orderId: '660000000000000000000002'
          }
        }
      }
    };

    const payloadString = JSON.stringify(payloadObj);
    const payloadBuffer = Buffer.from(payloadString, 'utf8');
    const signaturePayload = `${timestamp}.${payloadString}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload, 'utf8')
      .digest('hex');

    const signatureHeader = `t=${timestamp},v1=${hmac}`;

    return {
      payloadObj,
      payloadString,
      payloadBuffer,
      signatureHeader,
      timestamp,
      id,
      paymentIntentId
    };
  };

  describe('1. Ingress and Signature Verification', () => {
    test('persists valid signed webhook and returns 200 acknowledgment with received=true', async () => {
      const { payloadString, payloadBuffer, signatureHeader, id, paymentIntentId } = createSignedStripePayload();

      // Configure Stripe mock client for signature construction
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation((rawBody, sig) => {
            expect(Buffer.isBuffer(rawBody)).toBe(true);
            return JSON.parse(rawBody.toString('utf8'));
          })
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      const response = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signatureHeader)
        .send(payloadString);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        received: true,
        duplicate: false,
        outcome: WEBHOOK_PROCESSING_STATUSES.RECEIVED
      });
      expect(response.body.data.eventId).toBeDefined();

      const savedDoc = await PaymentWebhookEvent.findOne({ providerEventId: id });
      expect(savedDoc).not.toBeNull();
      expect(savedDoc.provider).toBe('stripe');
      expect(savedDoc.providerPaymentId).toBe(paymentIntentId);
      expect(savedDoc.amountMinor).toBe(5000);
      expect(savedDoc.currency).toBe('USD');
      expect(savedDoc.status).toBe(WEBHOOK_PROCESSING_STATUSES.RECEIVED);
      expect(savedDoc.attemptCount).toBe(0);
    });

    test('verifies raw request body is passed untouched as Buffer', async () => {
      const { payloadString, payloadBuffer, signatureHeader } = createSignedStripePayload();
      let capturedRawBody = null;

      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation((rawBody) => {
            capturedRawBody = rawBody;
            return JSON.parse(rawBody.toString('utf8'));
          })
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signatureHeader)
        .send(payloadString);

      expect(Buffer.isBuffer(capturedRawBody)).toBe(true);
      expect(capturedRawBody.equals(payloadBuffer)).toBe(true);
    });

    test('rejects missing signature with zero writes', async () => {
      const { payloadString } = createSignedStripePayload();

      const response = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(payloadString);

      expect(response.status).toBe(400);
      expect(response.body.error?.code || response.body.code).toBe('PAYMENT_WEBHOOK_VERIFICATION_FAILED');

      const count = await PaymentWebhookEvent.countDocuments();
      expect(count).toBe(0);
    });

    test('rejects invalid signature with zero writes', async () => {
      const { payloadString } = createSignedStripePayload();
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation(() => {
            const err = new Error('No signatures found matching the expected signature for payload');
            err.type = 'StripeSignatureVerificationError';
            throw err;
          })
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      const response = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 't=12345,v1=invalid_hmac_signature')
        .send(payloadString);

      expect(response.status).toBe(400);
      expect(response.body.error?.code || response.body.code).toBe('PAYMENT_WEBHOOK_VERIFICATION_FAILED');

      const count = await PaymentWebhookEvent.countDocuments();
      expect(count).toBe(0);
    });

    test('rejects expired timestamp beyond tolerance with zero writes', async () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const { payloadString, signatureHeader } = createSignedStripePayload({
        timestamp: expiredTimestamp
      });

      const response = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signatureHeader)
        .send(payloadString);

      expect(response.status).toBe(400);
      expect(response.body.error?.code || response.body.code).toBe('PAYMENT_WEBHOOK_VERIFICATION_FAILED');

      const count = await PaymentWebhookEvent.countDocuments();
      expect(count).toBe(0);
    });

    test('rejects excessive future clock skew with zero writes', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in future
      const { payloadString, signatureHeader } = createSignedStripePayload({
        timestamp: futureTimestamp
      });

      const response = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signatureHeader)
        .send(payloadString);

      expect(response.status).toBe(400);
      expect(response.body.error?.code || response.body.code).toBe('PAYMENT_WEBHOOK_VERIFICATION_FAILED');

      const count = await PaymentWebhookEvent.countDocuments();
      expect(count).toBe(0);
    });

    test('rejects unsupported provider with 400 and zero writes', async () => {
      const response = await request(app)
        .post('/api/payments/webhooks/unknown_provider')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 't=123,v1=abc')
        .send('{"test":1}');

      expect(response.status).toBe(400);
      const count = await PaymentWebhookEvent.countDocuments();
      expect(count).toBe(0);
    });
  });

  describe('2. Idempotency & Persistence Invariants', () => {
    test('identical duplicate webhook returns 200 with duplicate=true and creates exactly 1 record', async () => {
      const { payloadString, signatureHeader, id } = createSignedStripePayload();
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation((rawBody) => JSON.parse(rawBody.toString('utf8')))
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      // First delivery
      const res1 = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signatureHeader)
        .send(payloadString);

      expect(res1.status).toBe(200);
      expect(res1.body.data.duplicate).toBe(false);

      // Repeated delivery with exact same bytes
      const res2 = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signatureHeader)
        .send(payloadString);

      expect(res2.status).toBe(200);
      expect(res2.body.data.duplicate).toBe(true);

      const count = await PaymentWebhookEvent.countDocuments({ providerEventId: id });
      expect(count).toBe(1);
    });

    test('concurrent identical deliveries create exactly one event and both return 200', async () => {
      const { payloadString, signatureHeader, id } = createSignedStripePayload({ id: `evt_concurrent_${crypto.randomUUID()}` });
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation((rawBody) => JSON.parse(rawBody.toString('utf8')))
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/payments/webhooks/stripe')
          .set('Content-Type', 'application/json')
          .set('stripe-signature', signatureHeader)
          .send(payloadString),
        request(app)
          .post('/api/payments/webhooks/stripe')
          .set('Content-Type', 'application/json')
          .set('stripe-signature', signatureHeader)
          .send(payloadString)
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect([res1.body.data.duplicate, res2.body.data.duplicate]).toContain(false);
      expect([res1.body.data.duplicate, res2.body.data.duplicate]).toContain(true);

      const count = await PaymentWebhookEvent.countDocuments({ providerEventId: id });
      expect(count).toBe(1);
    });

    test('reused event ID with different payload hash returns 409 conflict and does not overwrite', async () => {
      const original = createSignedStripePayload({ id: 'evt_conflict_123', amount: 5000 });
      const conflicting = createSignedStripePayload({ id: 'evt_conflict_123', amount: 9999 });

      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation((rawBody) => JSON.parse(rawBody.toString('utf8')))
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      // First delivery
      const res1 = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', original.signatureHeader)
        .send(original.payloadString);

      expect(res1.status).toBe(200);

      // Conflicting delivery with same ID but different content
      const res2 = await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', conflicting.signatureHeader)
        .send(conflicting.payloadString);

      expect(res2.status).toBe(409);
      expect(res2.body.error?.code || res2.body.code).toBe('PAYMENT_WEBHOOK_PAYLOAD_HASH_MISMATCH');

      // Original doc remains untouched with original amount
      const savedDoc = await PaymentWebhookEvent.findOne({ providerEventId: 'evt_conflict_123' });
      expect(savedDoc.amountMinor).toBe(5000);
    });

    test('persistence failure returns 503 and does not return success', async () => {
      const { payloadString, signatureHeader } = createSignedStripePayload();
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation((rawBody) => JSON.parse(rawBody.toString('utf8')))
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      const createSpy = jest.spyOn(PaymentWebhookEvent, 'create').mockRejectedValueOnce(new Error('DB connection lost'));

      try {
        const response = await request(app)
          .post('/api/payments/webhooks/stripe')
          .set('Content-Type', 'application/json')
          .set('stripe-signature', signatureHeader)
          .send(payloadString);

        expect(response.status).toBe(503);
        expect(response.body.error?.code || response.body.code).toBe('PAYMENT_WEBHOOK_PERSISTENCE_FAILED');
      } finally {
        createSpy.mockRestore();
      }
    });

    test('ensures raw bodies, secrets, and signatures are never persisted in PaymentWebhookEvent', async () => {
      const { payloadString, signatureHeader, id } = createSignedStripePayload();
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation((rawBody) => JSON.parse(rawBody.toString('utf8')))
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      await request(app)
        .post('/api/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signatureHeader)
        .send(payloadString);

      const doc = await PaymentWebhookEvent.findOne({ providerEventId: id }).lean();
      expect(doc).not.toBeNull();

      expect(doc.rawBody).toBeUndefined();
      expect(doc.signature).toBeUndefined();
      expect(doc.secret).toBeUndefined();
      expect(doc.eventData.rawBody).toBeUndefined();
      expect(doc.eventData.secret).toBeUndefined();
      expect(doc.payloadHash).toBeUndefined(); // Selected false by default
    });

    test('retained legacy route /api/payments/webhook/:provider receives raw bytes untouched before JSON middleware', async () => {
      const { payloadString, signatureHeader, id } = createSignedStripePayload({ id: 'evt_legacy_route_test' });
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockImplementation((rawBody) => {
            expect(Buffer.isBuffer(rawBody)).toBe(true);
            return JSON.parse(rawBody.toString('utf8'));
          })
        }
      };
      StripeProvider.setClientForTests(fakeClient);

      const response = await request(app)
        .post('/api/payments/webhook/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signatureHeader)
        .send(payloadString);

      expect(response.status).toBe(200);
      expect(response.body.data.received).toBe(true);
      expect(fakeClient.webhooks.constructEvent).toHaveBeenCalledTimes(1);

      const doc = await PaymentWebhookEvent.findOne({ providerEventId: 'evt_legacy_route_test' });
      expect(doc).not.toBeNull();
      expect(doc.provider).toBe('stripe');
    });

    test('strict schema throws and fails closed when unauthorized arbitrary fields are injected', async () => {
      await expect(PaymentWebhookEvent.create({
        provider: 'stripe',
        providerEventId: 'evt_strict_test',
        eventType: 'payment_intent.succeeded',
        payloadHash: 'hash_test',
        unauthorizedArbitraryField: 'attack_payload'
      })).rejects.toThrow();
    });
  });
});

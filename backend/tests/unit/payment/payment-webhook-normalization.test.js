/**
 * @file payment-webhook-normalization.test.js
 * @description Unit tests for payment webhook event normalization and boundary sanitization.
 */

'use strict';

const stripeProvider = require('../../../services/payment/providers/StripeProvider');
const { AppError } = require('../../../common/errors/AppError');

describe('Phase 5B: Payment Webhook Normalization & Sanitization Unit Tests', () => {
  describe('1. Stripe Event Normalization', () => {
    test('normalizes standard payment_intent.succeeded event with strict allowlisted fields', () => {
      const rawEvent = {
        id: 'evt_test_1234567890',
        type: 'payment_intent.succeeded',
        created: 1718000000,
        livemode: false,
        data: {
          object: {
            id: 'pi_test_0987654321',
            object: 'payment_intent',
            amount: 5000,
            amount_received: 5000,
            currency: 'usd',
            status: 'succeeded',
            customer: 'cus_secret123',
            charges: { data: [{ id: 'ch_123', payment_method_details: { card: { brand: 'visa', last4: '4242' } } }] },
            metadata: {
              paymentId: 'pay_660000000000000000000001',
              orderId: 'ord_660000000000000000000002',
              secretInternalNotes: 'do_not_persist_me'
            }
          }
        }
      };

      const normalized = stripeProvider.normalizeWebhookEvent({
        verifiedEvent: rawEvent,
        account: { environment: 'sandbox', accountAlias: 'default' }
      });

      expect(normalized).toEqual({
        providerEventId: 'evt_test_1234567890',
        eventType: 'payment_intent.succeeded',
        providerPaymentId: 'pi_test_0987654321',
        providerRefundId: '',
        amountMinor: 5000,
        currency: 'USD',
        livemode: false,
        environment: 'sandbox',
        eventCreatedAt: new Date(1718000000 * 1000),
        normalizedObjectType: 'payment_intent',
        proposedStatus: 'Completed',
        rawObjectStatus: 'succeeded',
        metadata: {
          paymentId: 'pay_660000000000000000000001',
          orderId: 'ord_660000000000000000000002',
          refundId: ''
        }
      });

      // Assert that non-allowlisted customer, charges, card, internal notes are stripped
      expect(normalized).not.toHaveProperty('customer');
      expect(normalized).not.toHaveProperty('charges');
      expect(normalized.metadata).not.toHaveProperty('secretInternalNotes');
    });

    test('normalizes refund.created event with providerRefundId and providerPaymentId', () => {
      const rawRefundEvent = {
        id: 'evt_refund_99999',
        type: 'refund.created',
        created: 1718005000,
        livemode: true,
        data: {
          object: {
            id: 're_12345678',
            object: 'refund',
            payment_intent: 'pi_target_payment',
            amount: 2500,
            currency: 'eur',
            status: 'succeeded',
            metadata: {
              paymentId: 'pay_target',
              orderId: 'ord_target'
            }
          }
        }
      };

      const normalized = stripeProvider.normalizeWebhookEvent({
        verifiedEvent: rawRefundEvent,
        account: { environment: 'production', accountAlias: 'main' }
      });

      expect(normalized).toMatchObject({
        providerEventId: 'evt_refund_99999',
        eventType: 'refund.created',
        providerPaymentId: 'pi_target_payment',
        providerRefundId: 're_12345678',
        amountMinor: 2500,
        currency: 'EUR',
        livemode: true,
        environment: 'production',
        normalizedObjectType: 'refund'
      });
    });

    test('fails closed when rawEvent is missing or malformed', () => {
      expect(() => stripeProvider.normalizeWebhookEvent(null)).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
        })
      );

      expect(() => stripeProvider.normalizeWebhookEvent({ verifiedEvent: {} })).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
        })
      );
    });
  });

  describe('2. Livemode and Environment Verification', () => {
    test('rejects livemode event in sandbox environment', () => {
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockReturnValue({
            id: 'evt_live_in_test',
            type: 'payment_intent.succeeded',
            livemode: true, // LIVEMODE TRUE
            data: { object: { id: 'pi_test' } }
          })
        }
      };

      stripeProvider.setClientForTests(fakeClient);
      try {
        expect(() => {
          stripeProvider.verifyWebhookSignature({
            rawBody: Buffer.from('{"id":"evt_live_in_test"}'),
            signatureHeaders: 't=1000,v1=fake_sig',
            secret: 'whsec_test',
            account: { environment: 'sandbox' } // SANDBOX ENV
          });
        }).toThrow(
          expect.objectContaining({
            statusCode: 400,
            code: 'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
          })
        );
      } finally {
        stripeProvider.resetClientForTests();
      }
    });

    test('rejects testmode event in production environment', () => {
      const fakeClient = {
        webhooks: {
          constructEvent: jest.fn().mockReturnValue({
            id: 'evt_test_in_prod',
            type: 'payment_intent.succeeded',
            livemode: false, // LIVEMODE FALSE
            data: { object: { id: 'pi_test' } }
          })
        }
      };

      stripeProvider.setClientForTests(fakeClient);
      try {
        expect(() => {
          stripeProvider.verifyWebhookSignature({
            rawBody: Buffer.from('{"id":"evt_test_in_prod"}'),
            signatureHeaders: 't=1000,v1=fake_sig',
            secret: 'whsec_test',
            account: { environment: 'production' } // PRODUCTION ENV
          });
        }).toThrow(
          expect.objectContaining({
            statusCode: 400,
            code: 'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
          })
        );
      } finally {
        stripeProvider.resetClientForTests();
      }
    });
  });
});

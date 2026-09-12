const mongoose = require('mongoose');
const PaymentCapabilityPolicy = require('../../../services/payment/PaymentCapabilityPolicy').PaymentCapabilityPolicy;
const PaymentProvider = require('../../../modules/payments/core/PaymentProvider');
const PaymentProviderRegistry = require('../../../modules/payments/core/PaymentProviderRegistry');
const cod = require('../../../modules/payments/providers/cod/CodProvider');
const bankTransfer = require('../../../modules/payments/providers/bank-transfer/BankTransferProvider');
const raast = require('../../../modules/payments/providers/raast/RaastProvider');
const stripe = require('../../../modules/payments/providers/stripe/StripeProvider');
const jazzcash = require('../../../modules/payments/providers/jazzcash/JazzCashProvider');
const easypaisa = require('../../../modules/payments/providers/easypaisa/EasypaisaProvider');
const MerchantPaymentAccount = require('../../../models/MerchantPaymentAccount');
const {
  validateMerchantPaymentAccountInput,
  containsSecretKey
} = require('../../../validators/merchantPaymentAccountValidator');

describe('Phase 5A: PaymentCapabilityPolicy & Provider Governance', () => {
  let mockRegistry;
  let policy;

  beforeEach(() => {
    mockRegistry = new PaymentProviderRegistry({
      providers: [cod, bankTransfer, raast, stripe, jazzcash, easypaisa],
      edition: 'full',
      editionManifests: {
        full: {
          providers: ['cod', 'bank_transfer', 'raast', 'stripe', 'jazzcash', 'easypaisa']
        }
      },
      featureFlags: {
        cod: true,
        bank_transfer: true,
        raast: true,
        stripe: true,
        jazzcash: false,
        easypaisa: false
      },
      providerConfigs: {
        cod: {},
        bank_transfer: {
          accountTitle: 'Test Bank',
          bankName: 'Test Title',
          publicAccountReference: '123456'
        },
        raast: {
          accountTitle: 'Test Raast',
          publicRaastId: '03001234567'
        },
        stripe: {
          credentialConfigured: true,
          publishableKey: 'pk_test_sample'
        }
      }
    });

    policy = new PaymentCapabilityPolicy({
      registry: mockRegistry,
      AccountModel: null // Use runtime config fallback for pure unit evaluations
    });
  });

  describe('1. Canonical Contract & Non-Circular Lookup', () => {
    test('canonical PaymentProvider defines unified contract with webhook and capability flags', () => {
      expect(cod).toBeInstanceOf(PaymentProvider);
      expect(stripe).toBeInstanceOf(PaymentProvider);
      expect(cod.getManifest().requiresWebhook).toBe(false);
      expect(stripe.getManifest().requiresWebhook).toBe(true);
      expect(stripe.getManifest().supportsSignatureVerification).toBe(true);
    });

    test('re-export file in services/payment matches canonical PaymentProvider contract', () => {
      const LegacyPaymentProvider = require('../../../services/payment/PaymentProvider');
      expect(LegacyPaymentProvider).toBe(PaymentProvider);
    });

    test('registry resolves installed providers without circular policy dependency', () => {
      const installedStripe = mockRegistry.getInstalled('stripe');
      expect(installedStripe.getManifest().code).toBe('stripe');
      expect(mockRegistry.providers.has('stripe')).toBe(true);
    });
  });

  describe('2. Computed isOperational & Verification Governance', () => {
    test('computes isOperational dynamically without persisting derived field', async () => {
      const evaluation = await policy.evaluateOperational('cod', {
        country: 'Pakistan',
        currency: 'PKR'
      });

      expect(evaluation.isOperational).toBe(true);
      expect(evaluation.auditClassification).toBe('IMPLEMENTED');
      expect(evaluation.account).not.toHaveProperty('isOperational');
    });

    test('enforces production underwriting and sandbox verification in production environment', async () => {
      const mockAccountModel = {
        findOne: jest.fn().mockResolvedValue({
          provider: 'stripe',
          environment: 'production',
          isEnabled: true,
          merchantCountry: 'PK',
          settlementCurrency: 'PKR',
          supportedCurrencies: ['PKR'],
          supportedCountries: ['PK'],
          sandboxVerification: 'unverified',
          underwritingVerification: 'unverified',
          webhookVerification: 'unverified'
        })
      };

      const prodPolicy = new PaymentCapabilityPolicy({
        registry: mockRegistry,
        AccountModel: mockAccountModel
      });

      const evaluation = await prodPolicy.evaluateOperational('stripe', {
        country: 'Pakistan',
        currency: 'PKR'
      });

      expect(evaluation.isOperational).toBe(false);
      expect(evaluation.auditClassification).toBe('UNVERIFIED');
      expect(evaluation.reason).toBe('PAYMENT_UNDERWRITING_UNVERIFIED');
    });

    test('enforces webhook verification in production for webhook-requiring providers', async () => {
      const mockAccountModel = {
        findOne: jest.fn().mockResolvedValue({
          provider: 'stripe',
          environment: 'production',
          isEnabled: true,
          merchantCountry: 'AE',
          settlementCurrency: 'AED',
          supportedCurrencies: ['AED', 'USD'],
          supportedCountries: ['AE'],
          sandboxVerification: 'verified',
          underwritingVerification: 'verified',
          webhookVerification: 'unverified' // Webhook unverified
        })
      };

      const prodPolicy = new PaymentCapabilityPolicy({
        registry: mockRegistry,
        AccountModel: mockAccountModel
      });

      const evaluation = await prodPolicy.evaluateOperational('stripe', {
        country: 'AE',
        currency: 'AED'
      });

      expect(evaluation.isOperational).toBe(false);
      expect(evaluation.auditClassification).toBe('UNVERIFIED');
      expect(evaluation.reason).toBe('PAYMENT_WEBHOOK_UNVERIFIED');
    });
  });

  describe('3. Stripe Adapter Capability vs Deployment Activation', () => {
    test('Stripe adapter declares technical capabilities without hard-coded country lockout', () => {
      const manifest = stripe.getManifest();
      expect(manifest.supportedCountries).toEqual([]);
      expect(manifest.requiresWebhook).toBe(true);
      expect(manifest.capabilities.createPayment).toBe(true);
      expect(manifest.capabilities.refund).toBe(true);
    });

    test('future eligible UAE/UK/DE/US merchant account activates without code change', async () => {
      const uaeAccount = {
        provider: 'stripe',
        environment: 'production',
        isEnabled: true,
        merchantCountry: 'AE',
        settlementCurrency: 'AED',
        supportedCurrencies: ['AED', 'USD', 'EUR'],
        supportedCountries: ['AE', 'SA', 'GB', 'US'],
        sandboxVerification: 'verified',
        underwritingVerification: 'verified',
        webhookVerification: 'verified',
        evidenceReferences: {
          sandboxProof: 'EVD-SBX-UAE-2026',
          underwritingProof: 'EVD-UND-UAE-2026',
          webhookProof: 'EVD-WH-UAE-2026'
        }
      };

      const mockAccountModel = {
        findOne: jest.fn().mockResolvedValue(uaeAccount)
      };

      const internationalPolicy = new PaymentCapabilityPolicy({
        registry: mockRegistry,
        AccountModel: mockAccountModel
      });

      const evaluation = await internationalPolicy.evaluateOperational('stripe', {
        country: 'AE',
        currency: 'AED'
      });

      expect(evaluation.isOperational).toBe(true);
      expect(evaluation.publicAvailable).toBe(true);
      expect(evaluation.auditClassification).toBe('IMPLEMENTED');
      expect(evaluation.reason).toBeNull();
    });
  });

  describe('4. Domestic COD Policy', () => {
    test('COD is available for domestic Pakistan delivery with PKR', async () => {
      const evaluation = await policy.evaluateOperational('cod', {
        country: 'Pakistan',
        currency: 'PKR'
      });

      expect(evaluation.isOperational).toBe(true);
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.publicAvailable).toBe(true);
    });

    test('COD fails closed for international delivery country', async () => {
      const evaluation = await policy.evaluateOperational('cod', {
        country: 'United Arab Emirates',
        currency: 'PKR'
      });

      expect(evaluation.eligible).toBe(false);
      expect(evaluation.publicAvailable).toBe(false);
      expect(evaluation.reason).toBe('PAYMENT_COUNTRY_UNSUPPORTED');
    });

    test('COD fails closed for non-domestic currency', async () => {
      const evaluation = await policy.evaluateOperational('cod', {
        country: 'Pakistan',
        currency: 'USD'
      });

      expect(evaluation.eligible).toBe(false);
      expect(evaluation.publicAvailable).toBe(false);
      expect(evaluation.reason).toBe('PAYMENT_CURRENCY_UNSUPPORTED');
    });
  });

  describe('5. Zero-Secret Validation & Persistence Boundary', () => {
    test('detects and rejects secret-like keys case-insensitively at root level', () => {
      expect(containsSecretKey({ apiKey: 'secret_123' })).toBe(true);
      expect(containsSecretKey({ STRIPE_SECRET_KEY: 'sk_live_123' })).toBe(true);
      expect(containsSecretKey({ webhookSecret: 'whsec_123' })).toBe(true);
      expect(containsSecretKey({ password: 'pass' })).toBe(true);
      expect(containsSecretKey({ cvv: '123' })).toBe(true);
      expect(containsSecretKey({ cardNumber: '4242' })).toBe(true);
    });

    test('detects and rejects secret-like keys in nested objects and arrays', () => {
      expect(containsSecretKey({ nested: { secretKey: 'foo' } })).toBe(true);
      expect(containsSecretKey({ list: [{ credential: 'bar' }] })).toBe(true);
      expect(containsSecretKey({ normalField: 'value' })).toBe(false);
    });

    test('validator rejects forbidden secret fields without reproducing secret material in errors', () => {
      expect(() => {
        validateMerchantPaymentAccountInput({
          provider: 'stripe',
          apiKey: 'super_confidential_secret_value'
        });
      }).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'PAYMENT_SECRETS_FORBIDDEN'
        })
      );

      try {
        validateMerchantPaymentAccountInput({
          provider: 'stripe',
          secretKey: 'super_confidential_secret_value'
        });
      } catch (error) {
        expect(JSON.stringify(error)).not.toContain('super_confidential_secret_value');
      }
    });

    test('validator rejects unknown fields via strict schema boundary', () => {
      expect(() => {
        validateMerchantPaymentAccountInput({
          provider: 'stripe',
          unknownCustomField: 'arbitrary_value'
        });
      }).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'PAYMENT_VALIDATION_FAILED'
        })
      );
    });

    test('MerchantPaymentAccount Mongoose model strict:throw rejects unexpected fields on instantiation', () => {
      expect(() => {
        new MerchantPaymentAccount({
          provider: 'stripe',
          secretKey: 'illegal_secret'
        });
      }).toThrow();
    });
  });

  describe('6. Public Discovery Privacy', () => {
    test('public available methods hides internal reasons and unverified providers', async () => {
      const mockAccountModel = {
        findOne: jest.fn().mockImplementation((query) => {
          if (query.provider === 'stripe') {
            return Promise.resolve({
              provider: 'stripe',
              environment: 'production',
              isEnabled: true,
              merchantCountry: 'PK',
              settlementCurrency: 'PKR',
              supportedCurrencies: ['PKR'],
              supportedCountries: ['PK'],
              sandboxVerification: 'unverified',
              underwritingVerification: 'unverified', // Unverified in prod
              webhookVerification: 'unverified'
            });
          }
          return Promise.resolve(null);
        })
      };

      const privacyPolicy = new PaymentCapabilityPolicy({
        registry: mockRegistry,
        AccountModel: mockAccountModel
      });

      const methods = await privacyPolicy.getPublicAvailableMethods({
        country: 'Pakistan',
        currency: 'PKR'
      });

      const codes = methods.map((m) => m.code);
      expect(codes).toContain('cod');
      expect(codes).toContain('bank_transfer');
      expect(codes).toContain('raast');
      expect(codes).not.toContain('stripe');

      // Ensure no internal error reasons leaked in public method responses
      methods.forEach((method) => {
        expect(method).not.toHaveProperty('reason');
        expect(method).not.toHaveProperty('auditClassification');
        expect(method).not.toHaveProperty('verificationStatus');
      });
    });
  });
});

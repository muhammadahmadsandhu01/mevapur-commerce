const mongoose = require('mongoose');
const PaymentCapabilityPolicy = require('../../../services/payment/PaymentCapabilityPolicy').PaymentCapabilityPolicy;
const PaymentService = require('../../../services/payment/PaymentService');
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
    test('table-driven domestic COD configurations and cross-border rejection (PK, GB, AE, US, DE)', async () => {
      const testCases = [
        { merchantCountry: 'PK', baseCurrency: 'PKR', deliveryCountry: 'PK', currency: 'PKR', expectedEligible: true },
        { merchantCountry: 'PK', baseCurrency: 'PKR', deliveryCountry: 'Pakistan', currency: 'PKR', expectedEligible: true },
        { merchantCountry: 'GB', baseCurrency: 'GBP', deliveryCountry: 'GB', currency: 'GBP', expectedEligible: true },
        { merchantCountry: 'GB', baseCurrency: 'GBP', deliveryCountry: 'United Kingdom', currency: 'GBP', expectedEligible: true },
        { merchantCountry: 'AE', baseCurrency: 'AED', deliveryCountry: 'AE', currency: 'AED', expectedEligible: true },
        { merchantCountry: 'AE', baseCurrency: 'AED', deliveryCountry: 'United Arab Emirates', currency: 'AED', expectedEligible: true },
        { merchantCountry: 'US', baseCurrency: 'USD', deliveryCountry: 'US', currency: 'USD', expectedEligible: true },
        { merchantCountry: 'US', baseCurrency: 'USD', deliveryCountry: 'United States', currency: 'USD', expectedEligible: true },
        { merchantCountry: 'DE', baseCurrency: 'EUR', deliveryCountry: 'DE', currency: 'EUR', expectedEligible: true },
        { merchantCountry: 'DE', baseCurrency: 'EUR', deliveryCountry: 'Germany', currency: 'EUR', expectedEligible: true },
        // Cross-border or currency mismatch rejections
        { merchantCountry: 'PK', baseCurrency: 'PKR', deliveryCountry: 'GB', currency: 'PKR', expectedEligible: false, reason: 'PAYMENT_COUNTRY_UNSUPPORTED' },
        { merchantCountry: 'PK', baseCurrency: 'PKR', deliveryCountry: 'PK', currency: 'USD', expectedEligible: false, reason: 'PAYMENT_CURRENCY_UNSUPPORTED' },
        { merchantCountry: 'GB', baseCurrency: 'GBP', deliveryCountry: 'US', currency: 'GBP', expectedEligible: false, reason: 'PAYMENT_COUNTRY_UNSUPPORTED' },
        { merchantCountry: 'GB', baseCurrency: 'GBP', deliveryCountry: 'GB', currency: 'EUR', expectedEligible: false, reason: 'PAYMENT_CURRENCY_UNSUPPORTED' },
        { merchantCountry: 'AE', baseCurrency: 'AED', deliveryCountry: 'AE', currency: 'USD', expectedEligible: false, reason: 'PAYMENT_CURRENCY_UNSUPPORTED' }
      ];

      for (const tc of testCases) {
        const evaluation = await policy.evaluateOperational('cod', {
          merchantCountry: tc.merchantCountry,
          baseCurrency: tc.baseCurrency,
          deliveryCountry: tc.deliveryCountry,
          currency: tc.currency
        });

        expect(evaluation.eligible).toBe(tc.expectedEligible);
        if (tc.expectedEligible) {
          expect(evaluation.publicAvailable).toBe(true);
          expect(evaluation.reason).toBeNull();
        } else {
          expect(evaluation.publicAvailable).toBe(false);
          expect(evaluation.reason).toBe(tc.reason);
        }
      }
    });

    test('COD provider declares offline manifest flags and requires zero underwriting/webhook evidence', () => {
      const manifest = cod.getManifest();
      expect(manifest.paymentType).toBe('offline');
      expect(manifest.isOfflineMethod).toBe(true);
      expect(manifest.requiresMerchantAccount).toBe(false);
      expect(manifest.requiresUnderwriting).toBe(false);
      expect(manifest.requiresWebhook).toBe(false);
      expect(manifest.requiresExternalCredentials).toBe(false);
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

    test('detects and rejects secret token patterns in string values', () => {
      expect(containsSecretKey({ proof: 'sk_live_51ABC123456789' })).toBe(true);
      expect(containsSecretKey({ proof: 'sk_test_51ABC123456789' })).toBe(true);
      expect(containsSecretKey({ proof: 'whsec_abcdef123456789' })).toBe(true);
      expect(containsSecretKey({ proof: 'Bearer eyJhbGciOiJIUzI1Ni...' })).toBe(true);
      expect(containsSecretKey({ proof: 'DOC-VERIFIED-REF-123' })).toBe(false);
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

    test('validator rejects secret tokens in evidence reference values', () => {
      expect(() => {
        validateMerchantPaymentAccountInput({
          provider: 'stripe',
          evidenceReferences: {
            sandboxProof: 'sk_test_51ForbiddenStripeSecret'
          }
        });
      }).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'PAYMENT_SECRETS_FORBIDDEN'
        })
      );
    });

    test('validator accepts bounded non-secret accountAlias', () => {
      const validated = validateMerchantPaymentAccountInput({
        provider: 'stripe',
        accountAlias: 'main-stripe-acct'
      });
      expect(validated.accountAlias).toBe('main-stripe-acct');
    });

    test('validator rejects invalid or unbounded accountAlias', () => {
      expect(() => {
        validateMerchantPaymentAccountInput({
          provider: 'stripe',
          accountAlias: 'invalid alias with spaces!'
        });
      }).toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'PAYMENT_VALIDATION_FAILED'
        })
      );
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

  describe('6. Runtime Gate Independence', () => {
    test('database record alone cannot activate provider if runtime feature flag is disabled', async () => {
      // Mock account with 100% verified status in DB
      const fullyVerifiedAccount = {
        provider: 'stripe',
        environment: 'production',
        isEnabled: true,
        merchantCountry: 'PK',
        settlementCurrency: 'PKR',
        supportedCurrencies: ['PKR'],
        supportedCountries: ['PK'],
        sandboxVerification: 'verified',
        underwritingVerification: 'verified',
        webhookVerification: 'verified'
      };

      const mockAccountModel = {
        findOne: jest.fn().mockResolvedValue(fullyVerifiedAccount)
      };

      // Registry where runtime feature flag is false
      const disabledRuntimeRegistry = new PaymentProviderRegistry({
        providers: [stripe],
        edition: 'full',
        editionManifests: { full: { providers: ['stripe'] } },
        featureFlags: { stripe: false }, // RUNTIME GATE DISABLED
        providerConfigs: { stripe: { credentialConfigured: true } }
      });

      const runtimeGatedPolicy = new PaymentCapabilityPolicy({
        registry: disabledRuntimeRegistry,
        AccountModel: mockAccountModel
      });

      const evaluation = await runtimeGatedPolicy.evaluateOperational('stripe', {
        country: 'Pakistan',
        currency: 'PKR'
      });

      expect(evaluation.isOperational).toBe(false);
      expect(evaluation.auditClassification).toBe('DORMANT');
      expect(evaluation.reason).toBe('PAYMENT_PROVIDER_DISABLED');
    });
  });

  describe('7. Public Discovery Privacy', () => {
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

  describe('8. Authoritative Order Currency Resolution & Scoped Legacy Fallback', () => {
    test('exact-money Order snapshot currency takes priority over legacy field', () => {
      const order = {
        totalAmountExact: { amountMinor: '5000', currency: 'EUR' },
        currency: 'EUR',
        payment: { currency: 'EUR' }
      };

      const resolved = PaymentService.resolveAuthoritativeOrderCurrency(order);
      expect(resolved).toBe('EUR');
    });

    test('immutable Order payment/currency snapshot is used when exact snapshot is absent', () => {
      const order = {
        totalAmountExact: null,
        payment: { currency: 'GBP' }
      };

      const resolved = PaymentService.resolveAuthoritativeOrderCurrency(order);
      expect(resolved).toBe('GBP');
    });

    test('fails closed when exact snapshot currency conflicts with payment currency', () => {
      const order = {
        totalAmountExact: { amountMinor: '5000', currency: 'EUR' },
        payment: { currency: 'USD' }
      };

      expect(() => PaymentService.resolveAuthoritativeOrderCurrency(order))
        .toThrow(expect.objectContaining({
          statusCode: 409,
          code: 'PAYMENT_ORDER_CURRENCY_MISMATCH'
        }));
    });

    test('Pakistan legacy Order without exact fields resolves through explicit legacy PKR compatibility path', () => {
      const legacyOrder = {
        totalAmountExact: null,
        subtotalExact: null,
        shippingAddress: { country: 'Pakistan', countryCode: 'PK' },
        paymentMethod: 'cod'
      };

      const resolved = PaymentService.resolveAuthoritativeOrderCurrency(legacyOrder);
      expect(resolved).toBe('PKR');
    });

    test('new/global Order without authoritative currency fails closed', () => {
      const globalOrderWithoutCurrency = {
        totalAmountExact: null,
        subtotalExact: null,
        currency: null,
        payment: { currency: null },
        shippingAddress: { country: 'United Arab Emirates', countryCode: 'AE' },
        paymentMethod: 'stripe'
      };

      expect(() => PaymentService.resolveAuthoritativeOrderCurrency(globalOrderWithoutCurrency))
        .toThrow(expect.objectContaining({
          statusCode: 422,
          code: 'PAYMENT_CURRENCY_REQUIRED'
        }));
    });

    test('international Orders preserve exact currencies and cannot become PKR (AED, GBP, EUR, USD)', () => {
      const currencies = ['AED', 'GBP', 'EUR', 'USD'];

      currencies.forEach((curr) => {
        const order = {
          currency: curr,
          payment: { currency: curr },
          shippingAddress: { country: 'International' },
          paymentMethod: 'stripe'
        };

        const resolved = PaymentService.resolveAuthoritativeOrderCurrency(order);
        expect(resolved).toBe(curr);
        expect(resolved).not.toBe('PKR');
      });
    });
  });
});

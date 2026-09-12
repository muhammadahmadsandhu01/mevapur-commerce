const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const MerchantPaymentAccount = require('../../models/MerchantPaymentAccount');
const { AppError } = require('../../common/errors/AppError');

const PAKISTAN_COUNTRY_CODES = new Set(['PK', 'PAKISTAN']);

const isDomesticPakistan = (country) => {
  if (!country) return true;
  return PAKISTAN_COUNTRY_CODES.has(String(country).trim().toUpperCase());
};

class PaymentCapabilityPolicy {
  constructor({ registry = paymentProviderRegistry, AccountModel = MerchantPaymentAccount } = {}) {
    this.registry = registry;
    this.AccountModel = AccountModel;
  }

  async getMerchantAccount(providerCode) {
    if (this.AccountModel) {
      try {
        const account = await this.AccountModel.findOne({ provider: providerCode });
        if (account) {
          return account;
        }
      } catch (_error) {
        // Fallback to runtime deployment config if DB model not available or query fails
      }
    }

    // Default configuration fallback from environment
    const isProd = process.env.NODE_ENV === 'production';
    const featureFlags = this.registry.featureFlags || {};
    const providerConfigs = this.registry.providerConfigs || {};
    const isEnabled = featureFlags[providerCode] === true;

    // By default for current deployment:
    // Manual / COD methods in Pakistan are enabled and verified for domestic sandbox/production.
    // Online automated providers (like Stripe, JazzCash, Easypaisa) without verified underwriting start UNVERIFIED/DORMANT.
    const isDomesticManual = ['cod', 'bank_transfer', 'raast'].includes(providerCode);

    return {
      provider: providerCode,
      environment: isProd ? 'production' : 'sandbox',
      isEnabled,
      merchantCountry: 'PK',
      settlementCurrency: 'PKR',
      supportedCurrencies: ['PKR'],
      supportedCountries: ['PK'],
      sandboxVerification: isDomesticManual
        ? 'verified'
        : (providerConfigs[providerCode]?.credentialConfigured ? 'verified' : 'unverified'),
      underwritingVerification: isDomesticManual ? 'verified' : 'unverified',
      webhookVerification: isDomesticManual ? 'verified' : 'unverified',
      evidenceReferences: {
        sandboxProof: '',
        underwritingProof: '',
        webhookProof: ''
      },
      configProvenance: {
        version: '1.0.0',
        source: 'system_bootstrap'
      }
    };
  }

  async evaluateOperational(providerCode, context = {}) {
    let provider;
    try {
      provider = this.registry.getInstalled(providerCode);
    } catch (_error) {
      return {
        code: providerCode,
        installed: false,
        included: false,
        enabled: false,
        configured: false,
        isOperational: false,
        eligible: false,
        publicAvailable: false,
        auditClassification: 'ABSENT',
        reason: 'PAYMENT_PROVIDER_NOT_INSTALLED',
        capabilities: {}
      };
    }

    const manifest = provider.getManifest();
    const editionManifest = this.registry.getEditionManifest();
    const included = editionManifest.providers.includes(providerCode);

    if (!included) {
      return {
        code: providerCode,
        displayName: manifest.displayName,
        paymentType: manifest.paymentType,
        installed: true,
        included: false,
        enabled: false,
        configured: false,
        isOperational: false,
        eligible: false,
        publicAvailable: false,
        auditClassification: 'DORMANT',
        reason: 'PAYMENT_PROVIDER_NOT_INCLUDED',
        capabilities: provider.getCapabilities()
      };
    }

    const account = await this.getMerchantAccount(providerCode);
    const enabled = account.isEnabled === true;
    const configValidation = provider.validateConfig(
      this.registry.providerConfigs[providerCode] || {}
    );
    const configured = configValidation.configured === true;

    if (!enabled) {
      return {
        code: providerCode,
        displayName: manifest.displayName,
        paymentType: manifest.paymentType,
        installed: true,
        included: true,
        enabled: false,
        configured,
        isOperational: false,
        eligible: false,
        publicAvailable: false,
        auditClassification: 'DORMANT',
        reason: 'PAYMENT_PROVIDER_DISABLED',
        capabilities: provider.getCapabilities(),
        account
      };
    }

    if (!configured) {
      return {
        code: providerCode,
        displayName: manifest.displayName,
        paymentType: manifest.paymentType,
        installed: true,
        included: true,
        enabled: true,
        configured: false,
        isOperational: false,
        eligible: false,
        publicAvailable: false,
        auditClassification: 'DORMANT',
        reason: configValidation.reason || 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        capabilities: provider.getCapabilities(),
        account
      };
    }

    // Evaluate Verification State
    const isProduction = account.environment === 'production';
    let verificationReason = null;
    let auditClassification = 'IMPLEMENTED';

    if (isProduction) {
      if (account.underwritingVerification !== 'verified') {
        verificationReason = 'PAYMENT_UNDERWRITING_UNVERIFIED';
        auditClassification = 'UNVERIFIED';
      } else if (account.sandboxVerification !== 'verified') {
        verificationReason = 'PAYMENT_SANDBOX_UNVERIFIED';
        auditClassification = 'UNVERIFIED';
      } else if (manifest.requiresWebhook && account.webhookVerification !== 'verified') {
        verificationReason = 'PAYMENT_WEBHOOK_UNVERIFIED';
        auditClassification = 'UNVERIFIED';
      }
    } else {
      // Sandbox environment
      if (account.sandboxVerification === 'failed') {
        verificationReason = 'PAYMENT_SANDBOX_FAILED';
        auditClassification = 'UNVERIFIED';
      }
    }

    const isOperational = verificationReason === null;

    // Evaluate Context Eligibility (Country & Currency)
    let eligibilityReason = null;
    const reqCountry = context.country ? String(context.country).trim().toUpperCase() : '';
    const reqCurrency = context.currency ? String(context.currency).trim().toUpperCase() : '';

    // COD Special Policy (Requirement 12)
    if (providerCode === 'cod') {
      if (reqCountry && !isDomesticPakistan(reqCountry)) {
        eligibilityReason = 'PAYMENT_COUNTRY_UNSUPPORTED';
      } else if (reqCurrency && reqCurrency !== 'PKR') {
        eligibilityReason = 'PAYMENT_CURRENCY_UNSUPPORTED';
      }
    } else {
      // Generic provider country / currency check from account & adapter manifest
      const supportedCountries = (account.supportedCountries || []).map((c) => String(c).toUpperCase());
      const supportedCurrencies = (account.supportedCurrencies || []).map((c) => String(c).toUpperCase());

      if (reqCountry && supportedCountries.length > 0) {
        const countryMatch = supportedCountries.includes(reqCountry)
          || (isDomesticPakistan(reqCountry) && supportedCountries.includes('PK'));
        if (!countryMatch) {
          eligibilityReason = 'PAYMENT_COUNTRY_UNSUPPORTED';
        }
      }

      if (reqCurrency && !eligibilityReason && supportedCurrencies.length > 0) {
        if (!supportedCurrencies.includes(reqCurrency)) {
          eligibilityReason = 'PAYMENT_CURRENCY_UNSUPPORTED';
        }
      }
    }

    const eligible = eligibilityReason === null;
    const publicAvailable = isOperational && eligible;
    const finalReason = verificationReason || eligibilityReason;

    return {
      code: providerCode,
      displayName: manifest.displayName,
      paymentType: manifest.paymentType,
      integrationVersion: manifest.integrationVersion,
      contractVersion: manifest.contractVersion,
      installed: true,
      included: true,
      enabled: true,
      configured: true,
      isOperational,
      eligible,
      publicAvailable,
      auditClassification,
      reason: finalReason,
      capabilities: provider.getCapabilities(),
      account: {
        environment: account.environment,
        merchantCountry: account.merchantCountry,
        settlementCurrency: account.settlementCurrency,
        supportedCurrencies: account.supportedCurrencies,
        supportedCountries: account.supportedCountries,
        sandboxVerification: account.sandboxVerification,
        underwritingVerification: account.underwritingVerification,
        webhookVerification: account.webhookVerification
      }
    };
  }

  async getPublicAvailableMethods(context = {}) {
    const providerCodes = [...this.registry.providers.keys()];
    const results = [];

    for (const code of providerCodes) {
      const evaluation = await this.evaluateOperational(code, context);
      if (evaluation.publicAvailable) {
        const provider = this.registry.getInstalled(code);
        const metadata = provider.getPublicMetadata(
          this.registry.providerConfigs[code] || {}
        );
        results.push({
          code: evaluation.code,
          displayName: evaluation.displayName,
          paymentType: evaluation.paymentType,
          capabilities: evaluation.capabilities,
          metadata
        });
      }
    }

    return results;
  }

  async getAdminProviderStatuses(context = {}) {
    const providerCodes = [...this.registry.providers.keys()];
    const results = [];

    for (const code of providerCodes) {
      const evaluation = await this.evaluateOperational(code, context);
      const provider = this.registry.getInstalled(code);
      const metadata = provider.getAdminMetadata(
        this.registry.providerConfigs[code] || {}
      );

      results.push({
        code: evaluation.code,
        displayName: evaluation.displayName,
        integrationVersion: evaluation.integrationVersion,
        contractVersion: evaluation.contractVersion,
        paymentType: evaluation.paymentType,
        installed: evaluation.installed,
        included: evaluation.included,
        enabled: evaluation.enabled,
        configured: evaluation.configured,
        isOperational: evaluation.isOperational,
        auditClassification: evaluation.auditClassification,
        verificationStatus: {
          sandbox: evaluation.account?.sandboxVerification || 'unverified',
          underwriting: evaluation.account?.underwritingVerification || 'unverified',
          webhook: evaluation.account?.webhookVerification || 'unverified'
        },
        environment: evaluation.account?.environment || 'sandbox',
        supportedCurrencies: evaluation.account?.supportedCurrencies || ['PKR'],
        supportedCountries: evaluation.account?.supportedCountries || ['PK'],
        capabilities: evaluation.capabilities,
        metadata,
        reason: evaluation.reason
      });
    }

    return results;
  }

  async assertEligibleForOrder(order, providerCode) {
    const country = order.shippingAddress?.country || 'Pakistan';
    const currency = order.payment?.currency || order.currency || 'PKR';
    const amount = order.totalAmount;

    const evaluation = await this.evaluateOperational(providerCode, {
      country,
      currency,
      amount
    });

    if (!evaluation.isOperational || !evaluation.eligible) {
      const reasonCode = evaluation.reason || 'PAYMENT_PROVIDER_NOT_ELIGIBLE';
      const statusCode = [
        'PAYMENT_PROVIDER_NOT_CONFIGURED',
        'PAYMENT_PROVIDER_DISABLED',
        'PAYMENT_UNDERWRITING_UNVERIFIED',
        'PAYMENT_SANDBOX_UNVERIFIED',
        'PAYMENT_WEBHOOK_UNVERIFIED'
      ].includes(reasonCode) ? 503 : 409;

      throw new AppError(
        `Payment provider '${providerCode}' is not available for this order`,
        statusCode,
        reasonCode
      );
    }

    return evaluation;
  }
}

const defaultPolicy = new PaymentCapabilityPolicy();

module.exports = defaultPolicy;
module.exports.PaymentCapabilityPolicy = PaymentCapabilityPolicy;

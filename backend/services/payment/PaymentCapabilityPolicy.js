const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const MerchantPaymentAccount = require('../../models/MerchantPaymentAccount');
const { AppError } = require('../../common/errors/AppError');

const normalizeCountryCode = (country) => {
  if (!country) return '';
  try {
    const { CountryRegistry } = require('../../modules/commerce');
    if (CountryRegistry && typeof CountryRegistry.resolve === 'function') {
      const resolved = CountryRegistry.resolve(country);
      if (resolved && resolved.alpha2) return resolved.alpha2;
    }
  } catch {
    // fallback
  }
  const cleaned = String(country).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(cleaned)) {
    return cleaned;
  }
  return '';
};

class PaymentCapabilityPolicy {
  constructor({ registry = paymentProviderRegistry, AccountModel = MerchantPaymentAccount } = {}) {
    this.registry = registry;
    this.AccountModel = AccountModel;
  }

  async getMerchantAccount(providerCode, environment) {
    const isProd = process.env.NODE_ENV === 'production';
    const targetEnv = environment || (isProd ? 'production' : 'sandbox');

    if (this.AccountModel) {
      try {
        const account = await this.AccountModel.findOne({
          provider: providerCode,
          environment: targetEnv
        }) || await this.AccountModel.findOne({ provider: providerCode });

        if (account) {
          return account;
        }
      } catch (_error) {
        // Fallback to runtime deployment config if DB query fails
      }
    }

    // Default configuration fallback from environment and market
    const featureFlags = this.registry.featureFlags || {};
    const providerConfigs = this.registry.providerConfigs || {};
    const isEnabled = featureFlags[providerCode] === true;

    const isDomesticManual = ['cod', 'bank_transfer', 'raast'].includes(providerCode);

    let fallbackMerchantCountry = '';
    let fallbackCurrency = '';
    try {
      const MarketService = require('../MarketService');
      const marketConfig = await MarketService.getConfig();
      if (marketConfig) {
        fallbackMerchantCountry = marketConfig.merchantCountry || marketConfig.homeCountry || '';
        fallbackCurrency = marketConfig.baseCurrency || marketConfig.defaultCurrency || '';
      }
    } catch {
      // fallback
    }

    return {
      provider: providerCode,
      environment: targetEnv,
      accountAlias: 'default',
      isEnabled,
      merchantCountry: fallbackMerchantCountry || '',
      settlementCurrency: fallbackCurrency || '',
      supportedCurrencies: fallbackCurrency ? [fallbackCurrency] : [],
      supportedCountries: fallbackMerchantCountry ? [fallbackMerchantCountry] : [],
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

    // Independent Runtime Deployment Gate (Feature Flag from Environment/Config)
    const runtimeEnabled = this.registry.featureFlags[providerCode] === true;
    const configValidation = provider.validateConfig(
      this.registry.providerConfigs[providerCode] || {}
    );
    const configured = configValidation.configured === true;

    const account = await this.getMerchantAccount(providerCode, context.environment);
    const accountEnabled = account.isEnabled === true;
    const effectiveEnabled = runtimeEnabled && accountEnabled;

    if (!runtimeEnabled || !accountEnabled) {
      return {
        code: providerCode,
        displayName: manifest.displayName,
        paymentType: manifest.paymentType,
        installed: true,
        included: true,
        enabled: effectiveEnabled,
        configured,
        isOperational: false,
        eligible: false,
        publicAvailable: false,
        auditClassification: 'DORMANT',
        reason: !runtimeEnabled ? 'PAYMENT_PROVIDER_DISABLED' : 'PAYMENT_ACCOUNT_DISABLED',
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

    const requiresMerchantUnderwriting = manifest.requiresMerchantAccount !== false
      && manifest.requiresUnderwriting !== false
      && !manifest.isOfflineMethod;

    if (requiresMerchantUnderwriting) {
      if (isProduction) {
        if (account.underwritingVerification !== 'verified') {
          verificationReason = 'PAYMENT_UNDERWRITING_UNVERIFIED';
          auditClassification = 'UNVERIFIED';
        } else if (manifest.requiresExternalCredentials && account.sandboxVerification !== 'verified') {
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
    }

    const isOperational = verificationReason === null;

    // Evaluate Context Eligibility (Country & Currency)
    let eligibilityReason = null;
    const rawDeliveryCountry = context.deliveryCountry || context.country;
    const reqCountry = normalizeCountryCode(rawDeliveryCountry);
    const reqCurrency = context.currency ? String(context.currency).trim().toUpperCase() : '';

    // COD Domestic Policy (Section 2)
    if (providerCode === 'cod' || manifest.isOfflineMethod) {
      const merchantCountry = normalizeCountryCode(
        context.merchantCountry !== undefined ? context.merchantCountry : account.merchantCountry
      );
      const domesticCurrency = String(
        context.baseCurrency !== undefined ? context.baseCurrency : (account.settlementCurrency || '')
      ).trim().toUpperCase();

      if (!merchantCountry || !reqCountry || reqCountry !== merchantCountry) {
        eligibilityReason = 'PAYMENT_COUNTRY_UNSUPPORTED';
      } else if (reqCurrency && domesticCurrency && reqCurrency !== domesticCurrency) {
        eligibilityReason = 'PAYMENT_CURRENCY_UNSUPPORTED';
      }
    } else {
      // Generic provider country / currency check from account & adapter manifest
      const supportedCountries = (account.supportedCountries || []).map((c) => normalizeCountryCode(c)).filter(Boolean);
      const supportedCurrencies = (account.supportedCurrencies || []).map((c) => String(c).toUpperCase()).filter(Boolean);

      if (reqCountry && supportedCountries.length > 0) {
        if (!supportedCountries.includes(reqCountry)) {
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
        supportedCurrencies: evaluation.account?.supportedCurrencies || [],
        supportedCountries: evaluation.account?.supportedCountries || [],
        capabilities: evaluation.capabilities,
        metadata,
        reason: evaluation.reason
      });
    }

    return results;
  }

  async assertEligibleForOrder(order, providerCode, currencyParam = null) {
    const country = order.shippingAddress?.countryCode || order.shippingAddress?.country || null;
    const currency = currencyParam
      || order.totalAmountExact?.currency
      || order.subtotalExact?.currency
      || order.payment?.currency
      || order.currency
      || null;
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

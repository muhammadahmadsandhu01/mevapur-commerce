const { AppError } = require('../../../common/errors/AppError');

const REASON_TO_ERROR = Object.freeze({
  PAYMENT_PROVIDER_NOT_INSTALLED: {
    status: 404,
    message: 'The payment provider is not installed'
  },
  PAYMENT_PROVIDER_NOT_INCLUDED: {
    status: 409,
    message: 'The payment provider is not included in this client edition'
  },
  PAYMENT_PROVIDER_DISABLED: {
    status: 503,
    message: 'The payment provider is disabled'
  },
  PAYMENT_PROVIDER_NOT_CONFIGURED: {
    status: 503,
    message: 'The payment provider is not configured'
  },
  PAYMENT_PROVIDER_NOT_ELIGIBLE: {
    status: 409,
    message: 'The payment provider is not eligible for this checkout'
  }
});

class PaymentProviderRegistry {
  constructor({
    providers = [],
    edition = 'pakistan',
    editionManifests = {},
    featureFlags = {},
    providerConfigs = {}
  } = {}) {
    this.providers = new Map();
    this.edition = edition;
    this.editionManifests = editionManifests;
    this.featureFlags = featureFlags;
    this.providerConfigs = providerConfigs;
    providers.forEach((provider) => this.register(provider));
  }

  register(provider) {
    const manifest = provider?.getManifest?.();
    if (!manifest?.code) {
      throw new AppError(
        'Payment provider manifest is invalid',
        500,
        'PAYMENT_PROVIDER_MANIFEST_INVALID'
      );
    }
    this.providers.set(manifest.code, provider);
    return provider;
  }

  getEditionManifest() {
    return this.editionManifests[this.edition]
      || this.editionManifests.pakistan
      || { providers: [] };
  }

  describe(code, context = {}) {
    const provider = this.providers.get(code);
    if (!provider) {
      return {
        code,
        installed: false,
        included: false,
        enabled: false,
        configured: false,
        eligible: false,
        available: false,
        reason: 'PAYMENT_PROVIDER_NOT_INSTALLED'
      };
    }

    const manifest = provider.getManifest();
    const included = this.getEditionManifest().providers.includes(code);
    const enabled = this.featureFlags[code] === true;
    const config = provider.validateConfig(this.providerConfigs[code] || {});
    const eligibility = provider.evaluateEligibility(context);
    const configured = config.configured === true;
    const eligible = eligibility.eligible === true;
    const reason = !included
      ? 'PAYMENT_PROVIDER_NOT_INCLUDED'
      : !enabled
        ? 'PAYMENT_PROVIDER_DISABLED'
        : !configured
          ? (config.reason || 'PAYMENT_PROVIDER_NOT_CONFIGURED')
          : !eligible
            ? (eligibility.reason || 'PAYMENT_PROVIDER_NOT_ELIGIBLE')
            : null;

    return {
      code,
      displayName: manifest.displayName,
      integrationVersion: manifest.integrationVersion,
      contractVersion: manifest.contractVersion,
      paymentType: manifest.paymentType,
      installed: true,
      included,
      enabled,
      configured,
      eligible,
      available: reason === null,
      reason,
      capabilities: provider.getCapabilities()
    };
  }

  resolve(code, context = {}) {
    const description = this.describe(code, context);
    if (!description.available) {
      const error = REASON_TO_ERROR[description.reason]
        || REASON_TO_ERROR.PAYMENT_PROVIDER_NOT_ELIGIBLE;
      throw new AppError(error.message, error.status, description.reason);
    }
    return this.providers.get(code);
  }

  getInstalled(code) {
    const provider = this.providers.get(code);
    if (!provider) {
      const error = REASON_TO_ERROR.PAYMENT_PROVIDER_NOT_INSTALLED;
      throw new AppError(
        error.message,
        error.status,
        'PAYMENT_PROVIDER_NOT_INSTALLED'
      );
    }
    return provider;
  }

  getPublicMethods(context = {}) {
    return [...this.providers.keys()]
      .map((code) => ({
        ...this.describe(code, context),
        metadata: this.providers.get(code).getPublicMetadata(
          this.providerConfigs[code] || {}
        )
      }))
      .filter((entry) => entry.available)
      .map((entry) => ({
        code: entry.code,
        displayName: entry.displayName,
        paymentType: entry.paymentType,
        capabilities: entry.capabilities,
        metadata: entry.metadata
      }));
  }

  getAdminStatuses(context = {}) {
    return [...this.providers.keys()].map((code) => ({
      ...this.describe(code, context),
      metadata: this.providers.get(code).getAdminMetadata(
        this.providerConfigs[code] || {}
      )
    }));
  }

  getHistoricalMetadata(code, snapshot = {}) {
    const provider = this.providers.get(code);
    if (!provider) {
      return {
        code,
        displayName: snapshot.displayName || code || 'Unknown provider',
        integrationVersion: snapshot.integrationVersion || 'historical',
        installed: false
      };
    }

    const manifest = provider.getManifest();
    return {
      code,
      displayName: snapshot.displayName || manifest.displayName,
      integrationVersion:
        snapshot.integrationVersion || manifest.integrationVersion,
      installed: true
    };
  }
}

module.exports = PaymentProviderRegistry;

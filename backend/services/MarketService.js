/**
 * @file MarketService.js
 * @description Market & Currency Eligibility Service governed by versioned commerce configuration.
 * Consumes active CommerceConfigurationVersion as single source of truth.
 * Legacy fallback is restricted behind an explicit named gate for domestic COD only.
 */

const CommerceConfigurationService = require('./commerce/CommerceConfigurationService');
const CommerceConfigurationVersion = require('../models/CommerceConfigurationVersion');
const MarketConfig = require('../models/MarketConfig');
const { RolloutAuthority } = require('../modules/commerce');
const { AppError } = require('../common/errors/AppError');

class MarketService {
  /**
   * Resolves effective market configuration. Prefers active CommerceConfigurationVersion.
   * @param {Object} [options]
   * @param {string} [options.merchantScopeId='default']
   * @returns {Promise<Object>}
   */
  async getConfig({ merchantScopeId = 'default' } = {}) {
    const activeVersion = await CommerceConfigurationService.getActiveConfiguration({ merchantScopeId });
    if (activeVersion && activeVersion.merchantProfile) {
      const p = activeVersion.merchantProfile;
      const defaultOrigin = (p.fulfillmentOrigins || []).find((o) => o.enabled && o.isDefault)
        || p.fulfillmentOrigins?.[0]
        || { country: p.merchantCountry };

      return {
        key: merchantScopeId,
        configVersionId: `v${activeVersion.version}`,
        configVersionNumber: activeVersion.version,
        merchantScopeId: activeVersion.merchantScopeId,
        merchantCountry: p.merchantCountry,
        homeCountry: p.merchantCountry,
        sellingMode: p.sellingMode,
        enabledCountries: p.enabledCountries || [p.merchantCountry],
        baseCurrency: p.baseCurrency,
        defaultCurrency: p.defaultCurrency,
        enabledCurrencies: p.enabledCurrencies || [p.baseCurrency],
        defaultLocale: p.defaultLocale,
        defaultTimeZone: p.defaultTimeZone,
        fulfillmentOriginCountry: defaultOrigin.country || p.merchantCountry,
        returnDestinationCountry: p.merchantCountry,
        supportedIncoterms: p.supportedIncoterms || ['DOMESTIC', 'DAP'],
        taxCalculationMode: p.taxCalculationMode || 'exact_rational',
        rolloutMode: 'governed',
        isEnabled: true,
        isGovernedVersion: true,
        activeVersionDoc: activeVersion
      };
    }

    // Fail closed: No active governed configuration found
    throw new AppError(
      `No active commerce configuration version found for scope '${merchantScopeId}'`,
      503,
      'MARKET_CONFIGURATION_UNAVAILABLE'
    );
  }

  /**
   * Returns sanitized public market configuration.
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getPublicConfig(options = {}) {
    const config = await this.getConfig(options);
    return {
      configVersionId: config.configVersionId,
      merchantCountry: config.merchantCountry || config.homeCountry,
      homeCountry: config.homeCountry,
      sellingMode: config.sellingMode,
      enabledCountries: config.enabledCountries,
      baseCurrency: config.baseCurrency || config.defaultCurrency,
      defaultCurrency: config.defaultCurrency,
      enabledCurrencies: config.enabledCurrencies,
      defaultLocale: config.defaultLocale,
      defaultTimeZone: config.defaultTimeZone,
      fulfillmentOriginCountry: config.fulfillmentOriginCountry,
      returnDestinationCountry: config.returnDestinationCountry,
      supportedIncoterms: config.supportedIncoterms,
      rolloutMode: this.getEffectiveRolloutMode(config),
      isEnabled: config.isEnabled
    };
  }

  getEffectiveRolloutMode(config, readinessEvidence = null) {
    const requestedMode = config?.rolloutMode || RolloutAuthority.MODES.LEGACY;
    return RolloutAuthority.resolveEffectiveMode({
      requestedMode,
      readinessEvidence
    });
  }

  /**
   * Asserts that a destination country and currency are enabled in the active configuration.
   * @param {Object} params
   * @param {string} params.country
   * @param {string} params.currency
   * @param {string} [params.merchantScopeId='default']
   * @returns {Promise<Object>}
   */
  async assertEligible({ country, currency, merchantScopeId = 'default' }) {
    const config = await this.getConfig({ merchantScopeId });
    const canonicalCountry = (country || '').trim().toUpperCase();
    const canonicalCurrency = (currency || '').trim().toUpperCase();

    if (!config.isEnabled || !config.enabledCountries.includes(canonicalCountry)) {
      throw new AppError(`Shipping is not available for country '${canonicalCountry}'`, 409, 'MARKET_COUNTRY_INELIGIBLE');
    }
    if (!config.enabledCurrencies.includes(canonicalCurrency)) {
      throw new AppError(`Currency '${canonicalCurrency}' is not enabled for this market`, 409, 'MARKET_CURRENCY_INELIGIBLE');
    }
    return config;
  }

  async isCurrencyEnabled(currency, merchantScopeId = 'default') {
    try {
      const config = await this.getConfig({ merchantScopeId });
      return config.isEnabled && config.enabledCurrencies.includes((currency || '').trim().toUpperCase());
    } catch {
      return false;
    }
  }

  async isCountryEnabled(country, merchantScopeId = 'default') {
    try {
      const config = await this.getConfig({ merchantScopeId });
      return config.isEnabled && config.enabledCountries.includes((country || '').trim().toUpperCase());
    } catch {
      return false;
    }
  }

  /**
   * Updates market configuration for the specified merchant scope.
   * Updates MarketConfig and synchronizes active CommerceConfigurationVersion merchant profile if active.
   * @param {Object} updates
   * @param {string} [merchantScopeId='default']
   * @returns {Promise<Object>}
   */
  async update(updates, merchantScopeId = 'default') {
    const scope = (merchantScopeId || 'default').trim();
    let market = await MarketConfig.findOne({ key: scope });
    if (!market) {
      market = new MarketConfig({ key: scope, ...updates });
    } else {
      Object.assign(market, updates);
    }
    await market.save();

    const activeVersion = await CommerceConfigurationVersion.findOne({
      merchantScopeId: scope,
      status: 'active'
    });
    if (activeVersion && activeVersion.merchantProfile) {
      if (updates.homeCountry || updates.merchantCountry) {
        activeVersion.merchantProfile.merchantCountry = updates.homeCountry || updates.merchantCountry;
      }
      if (updates.defaultCurrency || updates.baseCurrency) {
        activeVersion.merchantProfile.baseCurrency = updates.defaultCurrency || updates.baseCurrency;
        activeVersion.merchantProfile.defaultCurrency = updates.defaultCurrency || updates.baseCurrency;
      }
      if (Array.isArray(updates.enabledCountries)) {
        activeVersion.merchantProfile.enabledCountries = updates.enabledCountries;
      }
      if (Array.isArray(updates.enabledCurrencies)) {
        activeVersion.merchantProfile.enabledCurrencies = updates.enabledCurrencies;
      }
      if (updates.sellingMode) {
        activeVersion.merchantProfile.sellingMode = updates.sellingMode;
      }
      await activeVersion.save();
    }

    return market;
  }
}

module.exports = new MarketService();
module.exports.MarketService = MarketService;

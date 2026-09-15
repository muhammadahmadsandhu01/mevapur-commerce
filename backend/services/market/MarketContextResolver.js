/**
 * @file MarketContextResolver.js
 * @description Canonical server-side shopping and delivery market context resolution.
 * Governed by active CommerceConfigurationVersion as single source of truth.
 *
 * Precedence:
 * 1. Explicit customer-selected market (query param, header, safe cookie), validated against active config.
 * 2. Authenticated customer's preferred market country (if enabled in active config).
 * 3. Authenticated customer's residence country (if enabled in active config).
 * 4. Merchant's configured home / default market country.
 * 5. Otherwise fail closed.
 */

const MarketService = require('../MarketService');
const { CountryRegistry, CurrencyRegistry } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class MarketContextResolver {
  /**
   * Normalizes a country identifier into a valid uppercase ISO 3166-1 alpha-2 code.
   * Rejects malformed strings, injection attempts, and unrecognized codes.
   * @param {*} input
   * @returns {string|null}
   */
  normalizeCountryCode(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim().toUpperCase();

    if (/^[A-Z]{2}$/.test(trimmed) && CountryRegistry.hasCountry(trimmed)) {
      return trimmed;
    }

    const resolved = CountryRegistry.resolve(trimmed);
    return resolved ? resolved.alpha2 : null;
  }

  /**
   * Extracts raw explicit market candidate from HTTP request transports.
   * @param {Object} req
   * @returns {string|null}
   */
  extractExplicitMarketCandidate(req) {
    if (!req) return null;

    // 1. Query parameter: ?market=GB or ?marketCountry=GB
    if (req.query) {
      if (req.query.market && typeof req.query.market === 'string') {
        return req.query.market;
      }
      if (req.query.marketCountry && typeof req.query.marketCountry === 'string') {
        return req.query.marketCountry;
      }
    }

    // 2. Safe Market Header: X-Market-Country
    if (req.headers) {
      const headerVal = req.headers['x-market-country'] || req.headers['X-Market-Country'];
      if (headerVal && typeof headerVal === 'string') {
        return headerVal;
      }
    }

    // 3. Safe non-PII cookie: market_country
    if (req.cookies) {
      const cookieVal = req.cookies.market_country || req.cookies.market_context;
      if (cookieVal && typeof cookieVal === 'string') {
        return cookieVal;
      }
    }

    return null;
  }

  /**
   * Resolves effective shopping market context for a request.
   * @param {Object} req - Express Request object or context object
   * @param {Object} [options]
   * @param {string} [options.merchantScopeId='default']
   * @param {Object} [options.user] - Optional pre-authenticated user document
   * @returns {Promise<Object>}
   */
  async resolve(req = {}, { merchantScopeId = 'default', user = null } = {}) {
    const config = await MarketService.getConfig({ merchantScopeId });
    const merchantHome = config.merchantCountry || config.homeCountry;
    const enabledCountries = config.enabledCountries || (merchantHome ? [merchantHome] : []);
    const authUser = user || req.user || null;

    // 1. Explicit request candidate
    const explicitCandidate = this.extractExplicitMarketCandidate(req);
    if (explicitCandidate) {
      const normalizedExplicit = this.normalizeCountryCode(explicitCandidate);
      if (!normalizedExplicit) {
        throw new AppError(
          `Invalid market identifier '${explicitCandidate}'. An ISO 3166-1 alpha-2 code is required.`,
          400,
          ERROR_CODES.BAD_REQUEST || 'INVALID_MARKET_CODE'
        );
      }
      if (!enabledCountries.includes(normalizedExplicit)) {
        throw new AppError(
          `Market '${normalizedExplicit}' is not enabled for this store.`,
          400,
          'MARKET_COUNTRY_INELIGIBLE'
        );
      }

      return {
        marketCountry: normalizedExplicit,
        currency: this.resolveMarketCurrency(normalizedExplicit, config),
        source: 'explicit_request',
        merchantScopeId,
        configVersionId: config.configVersionId,
        isCustomerSelected: true,
        homeCountry: merchantHome || null
      };
    }

    // 2. Authenticated user's preferred market
    if (authUser && authUser.preferredMarketCountry) {
      const normalizedPreferred = this.normalizeCountryCode(authUser.preferredMarketCountry);
      if (normalizedPreferred && enabledCountries.includes(normalizedPreferred)) {
        return {
          marketCountry: normalizedPreferred,
          currency: this.resolveMarketCurrency(normalizedPreferred, config),
          source: 'user_preference',
          merchantScopeId,
          configVersionId: config.configVersionId,
          isCustomerSelected: true,
          homeCountry: merchantHome || null
        };
      }
    }

    // 3. Authenticated user's residence country
    if (authUser && authUser.residenceCountry) {
      const normalizedResidence = this.normalizeCountryCode(authUser.residenceCountry);
      if (normalizedResidence && enabledCountries.includes(normalizedResidence)) {
        return {
          marketCountry: normalizedResidence,
          currency: this.resolveMarketCurrency(normalizedResidence, config),
          source: 'user_residence',
          merchantScopeId,
          configVersionId: config.configVersionId,
          isCustomerSelected: false,
          homeCountry: merchantHome || null
        };
      }
    }

    // 4. Merchant default / home market
    const defaultMarket = merchantHome ? this.normalizeCountryCode(merchantHome) : null;
    if (defaultMarket && enabledCountries.includes(defaultMarket)) {
      return {
        marketCountry: defaultMarket,
        currency: this.resolveMarketCurrency(defaultMarket, config),
        source: 'merchant_default',
        merchantScopeId,
        configVersionId: config.configVersionId,
        isCustomerSelected: false,
        homeCountry: merchantHome || null
      };
    }

    // 5. First enabled country fallback
    if (enabledCountries.length > 0) {
      const fallbackMarket = enabledCountries[0];
      return {
        marketCountry: fallbackMarket,
        currency: this.resolveMarketCurrency(fallbackMarket, config),
        source: 'merchant_default',
        merchantScopeId,
        configVersionId: config.configVersionId,
        isCustomerSelected: false,
        homeCountry: merchantHome || null
      };
    }

    // Fail closed
    throw new AppError(
      'No eligible market could be resolved for this store.',
      503,
      'MARKET_CONFIGURATION_UNAVAILABLE'
    );
  }

  /**
   * Resolves appropriate currency for a market country given the active commerce config.
   * @param {string} marketCountry
   * @param {Object} config
   * @returns {string}
   */
  resolveMarketCurrency(marketCountry, config) {
    const countryData = CountryRegistry.getCountry(marketCountry);
    const candidateCurrency = countryData?.defaultCurrency;
    const enabledCurrencies = config.enabledCurrencies || (config.defaultCurrency || config.baseCurrency ? [config.defaultCurrency || config.baseCurrency] : []);

    if (candidateCurrency && enabledCurrencies.includes(candidateCurrency)) {
      return candidateCurrency;
    }

    const fallbackCurrency = config.defaultCurrency || config.baseCurrency || enabledCurrencies[0];
    if (!fallbackCurrency) {
      throw new AppError(
        'Market configuration is missing currency configuration',
        503,
        'MARKET_CONFIGURATION_UNAVAILABLE'
      );
    }
    return fallbackCurrency;
  }

  /**
   * Generates a deterministic cache key partition including merchant scope and effective market.
   * @param {Object} params
   * @param {string} [params.merchantScopeId='default']
   * @param {string} params.marketCountry
   * @param {string} [params.entity='catalog']
   * @returns {string}
   */
  getCachePartitionKey({ merchantScopeId = 'default', marketCountry, entity = 'catalog' }) {
    const scope = (merchantScopeId || 'default').trim();
    if (!marketCountry) {
      throw new AppError('Market country is required for cache partition key', 400, 'MARKET_REQUIRED');
    }
    const market = marketCountry.trim().toUpperCase();
    return `${entity}:${scope}:${market}`;
  }
}

module.exports = new MarketContextResolver();
module.exports.MarketContextResolver = MarketContextResolver;

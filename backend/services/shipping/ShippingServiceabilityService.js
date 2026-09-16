/**
 * @file ShippingServiceabilityService.js
 * @description Authoritative serviceability and route evaluation engine for global shipping.
 * Pure evaluation against governed shipping rules with zero database write side-effects.
 */

const { CountryRegistry, CurrencyRegistry, Money, MoneyMapper } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');
const ManualTableShippingAdapter = require('../checkout/shipping/ManualTableShippingAdapter');

class ShippingServiceabilityService {
  constructor(shippingAdapter = null) {
    this.adapter = shippingAdapter || new ManualTableShippingAdapter();
  }

  /**
   * Checks whether a destination address is serviceable for shipping.
   * @param {Object} params
   * @param {string} params.countryCode - ISO 3166-1 alpha-2 destination country
   * @param {string} [params.originCountry] - ISO 3166-1 alpha-2 fulfillment origin country
   * @param {string} [params.subdivision=''] - State/province
   * @param {string} [params.postalCode=''] - Postal/ZIP code
   * @param {string} [params.city=''] - Locality/city
   * @param {number} [params.weightGrams=0] - Total cart weight in grams
   * @param {Money} [params.subtotalMoney] - Cart subtotal Money instance
   * @param {string} [params.currency='PKR'] - ISO 4217 currency
   * @param {Array<Object>} [params.shippingRules] - Explicit governed rules from active version
   * @param {string} [params.serviceLevel] - Optional specific service level
   * @returns {Promise<Object>} Serviceability report
   */
  async evaluateServiceability({
    countryCode,
    originCountry = null,
    subdivision = '',
    postalCode = '',
    city = '',
    weightGrams = 0,
    subtotalMoney = null,
    currency = 'PKR',
    shippingRules = null,
    serviceLevel = null
  }) {
    if (!countryCode || typeof countryCode !== 'string') {
      throw new AppError('Destination country code is required', 400, 'SHIPPING_COUNTRY_REQUIRED');
    }

    const canonicalCountry = countryCode.trim().toUpperCase();
    if (!CountryRegistry.hasCountry(canonicalCountry)) {
      return {
        isServiceable: false,
        countryCode: canonicalCountry,
        originCountry,
        reason: 'INVALID_COUNTRY',
        message: `Country code '${canonicalCountry}' is not recognized`,
        options: []
      };
    }

    const targetCurrency = (currency || 'PKR').trim().toUpperCase();
    const effectiveSubtotal = subtotalMoney || Money.zero(targetCurrency);

    try {
      if (serviceLevel) {
        const singleQuote = await this.adapter.quote({
          countryCode: canonicalCountry,
          originCountry,
          currency: targetCurrency,
          subtotalMoney: effectiveSubtotal,
          city,
          region: subdivision,
          postalCode,
          weightGrams,
          serviceLevel,
          shippingRules
        });

        return {
          isServiceable: true,
          countryCode: canonicalCountry,
          originCountry,
          isRemote: singleQuote.isRemote,
          options: [singleQuote]
        };
      }

      const allOptions = await this.adapter.quoteAllServices({
        countryCode: canonicalCountry,
        originCountry,
        currency: targetCurrency,
        subtotalMoney: effectiveSubtotal,
        city,
        region: subdivision,
        postalCode,
        weightGrams,
        shippingRules
      });

      if (!allOptions || allOptions.length === 0) {
        return {
          isServiceable: false,
          countryCode: canonicalCountry,
          originCountry,
          reason: 'NO_MATCHING_RULES',
          message: `No active shipping rule found for route ${originCountry || '*'} -> ${canonicalCountry}`,
          options: []
        };
      }

      return {
        isServiceable: true,
        countryCode: canonicalCountry,
        originCountry,
        isRemote: allOptions.some((opt) => opt.isRemote),
        options: allOptions
      };
    } catch (err) {
      if (err.statusCode === 409 || err.code === 'COMMERCE_SHIPPING_UNAVAILABLE') {
        return {
          isServiceable: false,
          countryCode: canonicalCountry,
          originCountry,
          reason: err.code || 'UNSERVICEABLE_ROUTE',
          message: err.message,
          options: []
        };
      }
      throw err;
    }
  }

  /**
   * Matches configured shipping rules against a specific route.
   * @param {Array<Object>} rules
   * @param {Object} criteria
   * @returns {Array<Object>}
   */
  filterMatchingRules(rules, { originCountry, destinationCountry, serviceCode = null, subdivision = '', postalCode = '' }) {
    if (!Array.isArray(rules)) return [];
    const dest = (destinationCountry || '').trim().toUpperCase();
    const orig = originCountry ? originCountry.trim().toUpperCase() : null;
    const service = serviceCode ? serviceCode.trim().toLowerCase() : null;

    return rules.filter((r) => {
      if (r.enabled === false) return false;
      if (r.destinationCountry !== dest) return false;

      if (orig && r.originCountry) {
        const ruleOrigin = r.originCountry.toUpperCase();
        if (ruleOrigin !== orig) {
          const isDomesticRule = orig === dest && Array.isArray(r.supportedIncoterms) && r.supportedIncoterms.includes('DOMESTIC');
          if (!isDomesticRule) return false;
        }
      }

      if (service && r.serviceCode && r.serviceCode.toLowerCase() !== service) {
        return false;
      }

      if (subdivision && Array.isArray(r.destinationSubdivisions) && r.destinationSubdivisions.length > 0) {
        const normSub = subdivision.trim().toUpperCase();
        if (!r.destinationSubdivisions.some((s) => s.toUpperCase() === normSub)) {
          return false;
        }
      }

      if (postalCode && Array.isArray(r.postalCodeRanges) && r.postalCodeRanges.length > 0) {
        if (!this.adapter.matchesPostalPattern(r.postalCodeRanges, postalCode)) {
          return false;
        }
      }

      return true;
    });
  }
}

module.exports = ShippingServiceabilityService;
module.exports.ShippingServiceabilityService = ShippingServiceabilityService;

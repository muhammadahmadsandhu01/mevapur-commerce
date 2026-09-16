/**
 * @file ManualTableShippingAdapter.js
 * @description Deterministic Table-Driven Shipping Quote Adapter.
 * Evaluates versioned configuration shipping rules, bounded postal patterns,
 * non-overlapping weight bands, priority ordering, and remote area surcharges with exact Money precision.
 */

const { Money, MoneyMapper } = require('../../../modules/commerce');
const { AppError } = require('../../../common/errors/AppError');

class ManualTableShippingAdapter {
  constructor(rules = null) {
    this.name = 'ManualTableShippingAdapter';
    this.version = '2.0.0';
    this.customRules = rules;
  }

  /**
   * Evaluates bounded postal-code matching against a rule's postal patterns.
   * Strictly avoids arbitrary regex execution.
   * @param {Array<Object>} patterns
   * @param {string} postalCode
   * @returns {boolean}
   */
  matchesPostalPattern(patterns, postalCode) {
    if (!patterns || patterns.length === 0) return true;
    if (!postalCode || typeof postalCode !== 'string') return false;

    const normalized = postalCode.trim().toUpperCase();

    for (const pat of patterns) {
      if (pat.type === 'exact' && pat.value && pat.value.trim().toUpperCase() === normalized) {
        return true;
      }
      if (pat.type === 'prefix' && pat.value && normalized.startsWith(pat.value.trim().toUpperCase())) {
        return true;
      }
      if (pat.type === 'numeric_range') {
        const num = parseInt(normalized, 10);
        const min = parseInt(pat.min, 10);
        const max = parseInt(pat.max, 10);
        if (!Number.isNaN(num) && !Number.isNaN(min) && !Number.isNaN(max)) {
          if (num >= min && num <= max) return true;
        }
      }
    }

    return false;
  }

  /**
   * Quote shipping rates for a destination and cart subtotal.
   * @param {Object} params
   * @param {string} params.countryCode - ISO 3166-1 alpha-2
   * @param {string} [params.originCountry=null] - ISO 3166-1 alpha-2
   * @param {string} [params.currency='PKR']
   * @param {Money} params.subtotalMoney
   * @param {string} [params.city='']
   * @param {string} [params.region='']
   * @param {string} [params.postalCode='']
   * @param {number} [params.weightKg=0]
   * @param {number} [params.weightGrams=0]
   * @param {string} [params.serviceLevel='standard'] - 'standard' | 'express' | string
   * @param {Array<Object>} [params.shippingRules=null]
   * @param {string|number} [params.configVersionId=null]
   * @returns {Promise<Object>}
   */
  async quote({
    countryCode,
    originCountry = null,
    currency = 'PKR',
    subtotalMoney,
    city = '',
    region = '',
    postalCode = '',
    weightKg = 0,
    weightGrams = 0,
    serviceLevel = 'standard',
    shippingRules = null,
    configVersionId = null
  }) {
    if (!countryCode || typeof countryCode !== 'string') {
      throw new AppError('Country code is required for shipping quote', 400, 'SHIPPING_COUNTRY_REQUIRED');
    }

    const canonicalCountry = countryCode.trim().toUpperCase();
    const canonicalOrigin = originCountry ? originCountry.trim().toUpperCase() : null;
    const canonicalCurrency = currency.trim().toUpperCase();
    const normalizedService = (serviceLevel || 'standard').trim().toLowerCase();

    // Determine weight in grams
    const totalGrams = weightGrams > 0 ? weightGrams : Math.round((Number(weightKg) || 0) * 1000);

    const rules = shippingRules || this.customRules || [];

    // Filter matching rules for destination country, origin country, and service level
    const candidates = rules.filter((r) => {
      if (r.enabled === false) return false;
      if (r.destinationCountry !== canonicalCountry) return false;
      if (canonicalOrigin && r.originCountry) {
        const ruleOrigin = r.originCountry.toUpperCase();
        if (ruleOrigin !== canonicalOrigin) {
          const isDomesticRule = canonicalOrigin === canonicalCountry && Array.isArray(r.supportedIncoterms) && r.supportedIncoterms.includes('DOMESTIC');
          if (!isDomesticRule) {
            return false;
          }
        }
      }

      // Match service level if specified on rule
      if (r.serviceCode && r.serviceCode.toLowerCase() !== normalizedService) {
        return false;
      }

      // Subdivision filtering if specified
      if (region && r.destinationSubdivisions && r.destinationSubdivisions.length > 0) {
        const normRegion = region.trim().toUpperCase();
        if (!r.destinationSubdivisions.some((s) => s.toUpperCase() === normRegion)) {
          return false;
        }
      }

      // Postal code range matching
      if (postalCode && r.postalCodeRanges && r.postalCodeRanges.length > 0) {
        if (!this.matchesPostalPattern(r.postalCodeRanges, postalCode)) {
          return false;
        }
      }

      return true;
    });

    if (!candidates || candidates.length === 0) {
      if (process.env.ALLOW_LEGACY_DOMESTIC_COD_COMPATIBILITY === 'true' && canonicalCountry === 'PK') {
        let legacyZones = [];
        try {
          const ShippingZone = require('../../../models/ShippingZone');
          legacyZones = await ShippingZone.find({ enabled: true, countries: 'PK' }).sort({ priority: 1 }).lean();
        } catch {
          // ignore error if model not reachable
        }

        if (legacyZones && legacyZones.length > 0) {
          const normCity = (city || '').trim().toLowerCase();
          const matchedZone = legacyZones.find((z) => z.cities && z.cities.some((c) => c.toLowerCase() === normCity)) || legacyZones[0];
          if (matchedZone) {
            candidates.push({
              ruleId: `LEGACY-${matchedZone._id}`,
              ruleName: matchedZone.name,
              destinationCountry: 'PK',
              currency: matchedZone.currency || 'PKR',
              baseRate: matchedZone.normalRate,
              baseRateExact: matchedZone.normalRateExact,
              freeShippingThreshold: matchedZone.freeShippingThreshold,
              freeShippingThresholdExact: matchedZone.freeShippingThresholdExact,
              remoteRate: matchedZone.remoteRate,
              remoteRateExact: matchedZone.remoteRateExact,
              remoteCities: matchedZone.remoteCities || [],
              deliveryMinDays: matchedZone.deliveryMinDays,
              deliveryMaxDays: matchedZone.deliveryMaxDays,
              remoteDeliveryMinDays: matchedZone.remoteDeliveryMinDays,
              remoteDeliveryMaxDays: matchedZone.remoteDeliveryMaxDays,
              priority: matchedZone.priority
            });
          }
        } else {
          // Default domestic test fallback only when explicit compatibility gate is ON
          candidates.push({
            ruleId: 'LEGACY-DOMESTIC-DEFAULT',
            ruleName: 'Domestic Standard Delivery (Legacy Gate)',
            destinationCountry: 'PK',
            currency: 'PKR',
            baseRate: 250,
            freeShippingThreshold: 5000,
            deliveryMinDays: 2,
            deliveryMaxDays: 5,
            priority: 100
          });
        }
      }
    }

    if (!candidates || candidates.length === 0) {
      throw new AppError(
        `No shipping rules configured for destination country '${canonicalCountry}' (${serviceLevel})`,
        409,
        'SHIPPING_ZONE_UNAVAILABLE'
      );
    }

    // Sort candidates deterministically by priority (lowest number wins) and tie-break by ruleId
    candidates.sort((a, b) => {
      const pA = a.priority != null ? a.priority : 100;
      const pB = b.priority != null ? b.priority : 100;
      if (pA !== pB) return pA - pB;
      return String(a.ruleId || '').localeCompare(String(b.ruleId || ''));
    });

    const rule = candidates[0];

    const ruleCurrency = (rule.currency || canonicalCurrency).toUpperCase();
    if (ruleCurrency !== canonicalCurrency) {
      throw new AppError(
        `Shipping rule currency (${ruleCurrency}) does not match quote currency (${canonicalCurrency})`,
        409,
        'SHIPPING_CURRENCY_MISMATCH'
      );
    }

    // 1. Resolve base rate into exact Money
    let baseRateMoney = rule.baseRateExact && rule.baseRateExact.amountMinor !== undefined
      ? MoneyMapper.toMoney(rule.baseRateExact)
      : (rule.normalRateExact && rule.normalRateExact.amountMinor !== undefined
        ? MoneyMapper.toMoney(rule.normalRateExact)
        : Money.fromLegacyNumber(rule.baseRate || rule.normalRate || 0, canonicalCurrency));

    // 2. Resolve free shipping threshold
    let thresholdMoney = null;
    if (rule.freeShippingThresholdExact && rule.freeShippingThresholdExact.amountMinor !== undefined) {
      thresholdMoney = MoneyMapper.toMoney(rule.freeShippingThresholdExact);
    } else if (rule.freeShippingThreshold != null) {
      thresholdMoney = Money.fromLegacyNumber(rule.freeShippingThreshold, canonicalCurrency);
    }

    // 3. Remote check
    const normalizedCity = (city || '').trim().toLowerCase();
    const normalizedPostal = (postalCode || '').trim().toUpperCase();
    const isRemoteCity = Boolean(
      normalizedCity
      && rule.remoteCities
      && rule.remoteCities.some((c) => c.toLowerCase() === normalizedCity)
    );
    const isRemotePostal = Boolean(
      normalizedPostal
      && rule.remotePostalPrefixes
      && rule.remotePostalPrefixes.some((p) => normalizedPostal.startsWith(p.toUpperCase()))
    );
    const isRemote = isRemoteCity || isRemotePostal;

    let remoteRateMoney = null;
    if (rule.remoteRateExact && rule.remoteRateExact.amountMinor !== undefined) {
      remoteRateMoney = MoneyMapper.toMoney(rule.remoteRateExact);
    } else if (rule.remoteRate != null) {
      remoteRateMoney = Money.fromLegacyNumber(rule.remoteRate, canonicalCurrency);
    }

    // Free shipping applies only if non-remote and subtotal >= threshold
    const isFreeEligible = !isRemote && thresholdMoney != null && subtotalMoney.amountMinor >= thresholdMoney.amountMinor;

    let calculatedRateMoney = isFreeEligible
      ? Money.zero(canonicalCurrency)
      : (isRemote && remoteRateMoney ? remoteRateMoney : baseRateMoney);

    // 4. Weight bands evaluation
    if (Array.isArray(rule.weightBands) && rule.weightBands.length > 0 && totalGrams > 0) {
      const matchingBand = rule.weightBands.find((b) => (
        totalGrams >= (b.minWeightGrams || 0) && totalGrams < (b.maxWeightGrams || Infinity)
      ));

      if (matchingBand && matchingBand.rateExact) {
        const bandRateMoney = MoneyMapper.toMoney(matchingBand.rateExact);
        if (matchingBand.pricingMode === 'ADD_TO_BASE') {
          calculatedRateMoney = calculatedRateMoney.add(bandRateMoney);
        } else {
          calculatedRateMoney = bandRateMoney;
        }
      }
    }

    const minDays = isRemote && rule.remoteDeliveryMinDays != null
      ? rule.remoteDeliveryMinDays
      : (rule.deliveryMinDays != null ? rule.deliveryMinDays : 3);

    const maxDays = isRemote && rule.remoteDeliveryMaxDays != null
      ? rule.remoteDeliveryMaxDays
      : (rule.deliveryMaxDays != null ? rule.deliveryMaxDays : 7);

    return {
      adapter: this.name,
      version: this.version,
      serviceLevel: normalizedService,
      ruleId: rule.ruleId || 'ZONE-RULE',
      ruleName: rule.displayName || rule.name || 'Standard Delivery',
      currency: canonicalCurrency,
      shippingAmount: Number(calculatedRateMoney.toDecimalString()),
      shippingAmountExact: MoneyMapper.toPersistence(calculatedRateMoney),
      freeShippingApplied: isFreeEligible,
      isRemote,
      deliveryEstimate: {
        minDays,
        maxDays
      },
      provenance: {
        source: 'GOVERNED_SHIPPING_TABLE',
        configVersionId: configVersionId || rule.configVersionId || 'v-active',
        ruleId: rule.ruleId || 'RULE-DEF',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Evaluates all distinct shipping service levels available for a given route and cart.
   * @param {Object} params
   * @returns {Promise<Array<Object>>}
   */
  async quoteAllServices(params) {
    const rules = params.shippingRules || this.customRules || [];
    const canonicalCountry = (params.countryCode || '').trim().toUpperCase();
    const canonicalOrigin = params.originCountry ? params.originCountry.trim().toUpperCase() : null;

    // Discover matching rules for route to identify configured service codes
    const matchingRules = rules.filter((r) => {
      if (r.enabled === false) return false;
      if (r.destinationCountry !== canonicalCountry) return false;
      if (canonicalOrigin && r.originCountry) {
        const ruleOrigin = r.originCountry.toUpperCase();
        if (ruleOrigin !== canonicalOrigin) {
          const isDomesticRule = canonicalOrigin === canonicalCountry && Array.isArray(r.supportedIncoterms) && r.supportedIncoterms.includes('DOMESTIC');
          if (!isDomesticRule) {
            return false;
          }
        }
      }
      return true;
    });

    const discoveredCodes = new Set(
      matchingRules
        .map((r) => (r.serviceCode || 'standard').toLowerCase().trim())
        .filter(Boolean)
    );

    // If rules do not define explicit services or is empty, try default standard & express
    if (discoveredCodes.size === 0) {
      discoveredCodes.add('standard');
      discoveredCodes.add('express');
    }

    const quotes = [];
    for (const sc of discoveredCodes) {
      try {
        const q = await this.quote({
          ...params,
          serviceLevel: sc
        });
        quotes.push(q);
      } catch {
        // Service level might not be serviceable for this specific address/subdivision
      }
    }

    // Sort options by priority (e.g. standard before express if standard is lower priority number)
    return quotes;
  }
}

module.exports = ManualTableShippingAdapter;

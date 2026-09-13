/**
 * @file ManualTableShippingAdapter.js
 * @description Deterministic Table-Driven Shipping Quote Adapter.
 * Computes exact-money rates across zones, multi-service options (Standard, Express),
 * and country eligibility.
 */

const ShippingZone = require('../../../models/ShippingZone');
const { Money, MoneyMapper } = require('../../../modules/commerce');
const { AppError } = require('../../../common/errors/AppError');

class ManualTableShippingAdapter {
  constructor() {
    this.name = 'ManualTableShippingAdapter';
    this.version = '1.0.0';
  }

  /**
   * Quote shipping rates for a destination and cart subtotal.
   * @param {Object} params
   * @param {string} params.countryCode - ISO 3166-1 alpha-2
   * @param {string} [params.currency='PKR']
   * @param {Money} params.subtotalMoney
   * @param {string} [params.city]
   * @param {string} [params.region]
   * @param {string} [params.postalCode]
   * @param {number} [params.weightKg=0]
   * @param {string} [params.serviceLevel='standard'] - 'standard' | 'express'
   * @returns {Promise<Object>}
   */
  async quote({
    countryCode,
    currency = 'PKR',
    subtotalMoney,
    city = '',
    region = '',
    postalCode = '',
    weightKg = 0,
    serviceLevel = 'standard'
  }) {
    const canonicalCountry = countryCode.trim().toUpperCase();
    const canonicalCurrency = currency.trim().toUpperCase();

    const zones = await ShippingZone.find({
      enabled: true,
      countries: canonicalCountry
    }).sort({ priority: 1, _id: 1 });

    if (!zones || zones.length === 0) {
      throw new AppError(
        `No shipping zones configured for destination country '${canonicalCountry}'`,
        409,
        'SHIPPING_ZONE_UNAVAILABLE'
      );
    }

    const normalizedCity = (city || '').trim().toLowerCase();
    const normalizedRegion = (region || '').trim().toLowerCase();

    const zone = zones.find((candidate) => (
      candidate.cities.length === 0 || candidate.cities.some((c) => c.toLowerCase() === normalizedCity)
    )) || zones.find((candidate) => (
      candidate.regions.length === 0 || candidate.regions.some((r) => r.toLowerCase() === normalizedRegion)
    )) || zones[0];

    const zoneCurrency = (zone.currency || canonicalCurrency).toUpperCase();
    if (zoneCurrency !== canonicalCurrency) {
      throw new AppError(
        `Shipping zone currency (${zoneCurrency}) does not match order currency (${canonicalCurrency})`,
        409,
        'SHIPPING_CURRENCY_MISMATCH'
      );
    }

    // 1. Resolve rates into exact Money objects
    let normalRateMoney = zone.normalRateExact && zone.normalRateExact.amountMinor
      ? MoneyMapper.toMoney(zone.normalRateExact)
      : Money.fromLegacyNumber(zone.normalRate != null ? zone.normalRate : 250, canonicalCurrency);

    let thresholdMoney = zone.freeShippingThresholdExact && zone.freeShippingThresholdExact.amountMinor
      ? MoneyMapper.toMoney(zone.freeShippingThresholdExact)
      : Money.fromLegacyNumber(zone.freeShippingThreshold != null ? zone.freeShippingThreshold : 5000, canonicalCurrency);

    let remoteRateMoney = zone.remoteRateExact && zone.remoteRateExact.amountMinor
      ? MoneyMapper.toMoney(zone.remoteRateExact)
      : (zone.remoteRate != null ? Money.fromLegacyNumber(zone.remoteRate, canonicalCurrency) : null);

    const isRemote = Boolean(
      normalizedCity
      && zone.remoteCities
      && zone.remoteCities.some((c) => c.toLowerCase() === normalizedCity)
    );

    const isFreeEligible = !isRemote && subtotalMoney.amountMinor >= thresholdMoney.amountMinor;

    let baseRateMoney = isFreeEligible
      ? Money.zero(canonicalCurrency)
      : (isRemote && remoteRateMoney ? remoteRateMoney : normalRateMoney);

    // Apply express surcharge if requested
    if (serviceLevel === 'express') {
      // 50% surcharge for express shipping
      const expressSurcharge = baseRateMoney.isZero()
        ? normalRateMoney
        : baseRateMoney.multiplyRational(50, 100, 'HALF_UP');
      baseRateMoney = baseRateMoney.add(expressSurcharge);
    }

    // Weight multiplication if weight is specified and > 1kg
    if (weightKg > 1) {
      const excessKg = Math.ceil(weightKg - 1);
      const surcharge = baseRateMoney.multiplyRational(excessKg * 10, 100, 'HALF_UP');
      baseRateMoney = baseRateMoney.add(surcharge);
    }

    const minDays = isRemote && zone.remoteDeliveryMinDays != null
      ? zone.remoteDeliveryMinDays
      : (serviceLevel === 'express' ? Math.max(1, zone.deliveryMinDays - 1) : zone.deliveryMinDays);

    const maxDays = isRemote && zone.remoteDeliveryMaxDays != null
      ? zone.remoteDeliveryMaxDays
      : (serviceLevel === 'express' ? Math.max(2, zone.deliveryMaxDays - 1) : zone.deliveryMaxDays);

    return {
      adapter: this.name,
      version: this.version,
      serviceLevel,
      zoneId: String(zone._id),
      zoneName: zone.name,
      currency: canonicalCurrency,
      shippingAmount: Number(baseRateMoney.toDecimalString()),
      shippingAmountExact: MoneyMapper.toPersistence(baseRateMoney),
      freeShippingApplied: isFreeEligible && serviceLevel === 'standard',
      isRemote,
      deliveryEstimate: {
        minDays,
        maxDays
      },
      provenance: {
        source: 'ZONE_TABLE_DETERMINISTIC',
        zoneId: String(zone._id),
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = ManualTableShippingAdapter;

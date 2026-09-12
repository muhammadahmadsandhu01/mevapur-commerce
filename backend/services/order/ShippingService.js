const ShippingZone = require('../../models/ShippingZone');
const MarketService = require('../MarketService');
const { AppError } = require('../../common/errors/AppError');
const { Money, MoneyMapper, RolloutAuthority } = require('../../modules/commerce');

class ShippingService {
  roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  async ensureDemoZone(market) {
    if (market.homeCountry !== 'PK') return;
    const existing = await ShippingZone.exists({});
    if (!existing) {
      const normalRateExact = MoneyMapper.fromLegacy(250, 'PKR');
      const freeShippingThresholdExact = MoneyMapper.fromLegacy(5000, 'PKR');
      const remoteRateExact = MoneyMapper.fromLegacy(350, 'PKR');

      await ShippingZone.create([
        {
          name: 'Pakistan major cities',
          enabled: true,
          countries: ['PK'],
          cities: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad'],
          normalRate: 250,
          normalRateExact,
          freeShippingThreshold: 5000,
          freeShippingThresholdExact,
          remoteRate: 350,
          remoteRateExact,
          currency: 'PKR',
          deliveryMinDays: 2,
          deliveryMaxDays: 4,
          remoteDeliveryMinDays: 4,
          remoteDeliveryMaxDays: 7,
          priority: 10
        },
        {
          name: 'Pakistan standard delivery',
          enabled: true,
          countries: ['PK'],
          normalRate: 250,
          normalRateExact,
          freeShippingThreshold: 5000,
          freeShippingThresholdExact,
          remoteRate: 350,
          remoteRateExact,
          currency: 'PKR',
          deliveryMinDays: 3,
          deliveryMaxDays: 5,
          remoteDeliveryMinDays: 4,
          remoteDeliveryMaxDays: 7,
          priority: 100
        }
      ]);
    }
  }

  /**
   * Quote shipping rates with exact-money precision and legacy compatibility.
   * @param {Object} params
   * @param {string} params.country
   * @param {string} [params.currency='PKR']
   * @param {number|Money} params.subtotal
   * @param {string} [params.city]
   * @param {string} [params.region]
   * @param {string} [params.postalCode]
   * @param {number} [params.weightKg=0]
   */
  async quote({
    country,
    currency = 'PKR',
    subtotal,
    city = '',
    region = '',
    postalCode = '',
    weightKg = 0
  }) {
    const canonicalCurrency = String(currency).toUpperCase();
    const market = await MarketService.assertEligible({ country, currency: canonicalCurrency });
    await this.ensureDemoZone(market);

    const countryCode = country.length === 2 ? country.toUpperCase() : (country.toUpperCase() === 'PAKISTAN' ? 'PK' : country);
    const zones = await ShippingZone.find({
      enabled: true,
      $or: [{ countries: countryCode }, { countries: country }]
    }).sort({ priority: 1, _id: 1 });

    const normalizedCity = city.trim().toLocaleLowerCase();
    const normalizedRegion = region.trim().toLocaleLowerCase();

    const zone = zones.find((candidate) => (
      candidate.cities.length === 0 || candidate.cities.some((value) => value.toLocaleLowerCase() === normalizedCity)
    )) || zones.find((candidate) => (
      candidate.regions.length === 0 || candidate.regions.some((value) => value.toLocaleLowerCase() === normalizedRegion)
    ));

    if (!zone) {
      throw new AppError('No shipping zone is available for this address', 409, 'SHIPPING_ZONE_UNAVAILABLE');
    }

    const zoneCurrency = (zone.currency || market.baseCurrency || 'PKR').toUpperCase();
    if (zoneCurrency !== canonicalCurrency) {
      throw new AppError(
        `Shipping zone currency (${zoneCurrency}) does not match order currency (${canonicalCurrency})`,
        409,
        'SHIPPING_CURRENCY_MISMATCH'
      );
    }

    const effectiveMode = MarketService.getEffectiveRolloutMode(market);

    // 1. Resolve subtotal Money value
    let subtotalMoney;
    if (subtotal instanceof Money) {
      if (subtotal.currency !== canonicalCurrency) {
        throw new AppError('Subtotal money currency does not match requested shipping currency', 400, 'SHIPPING_CURRENCY_MISMATCH');
      }
      subtotalMoney = subtotal;
    } else if (typeof subtotal === 'number' && Number.isFinite(subtotal)) {
      subtotalMoney = Money.fromLegacyNumber(subtotal, canonicalCurrency);
    } else {
      subtotalMoney = Money.zero(canonicalCurrency);
    }

    // 2. Resolve Threshold and Rates into exact Money value objects
    let thresholdMoney;
    let normalRateMoney;
    let remoteRateMoney = null;

    if (effectiveMode === 'exact_read') {
      if (!zone.normalRateExact || !zone.freeShippingThresholdExact) {
        throw new AppError('Shipping zone lacks exact money definition in exact_read mode', 500, 'SHIPPING_EXACT_FIELDS_MISSING');
      }
      thresholdMoney = MoneyMapper.toMoney(zone.freeShippingThresholdExact);
      normalRateMoney = MoneyMapper.toMoney(zone.normalRateExact);
      if (zone.remoteRateExact && zone.remoteRateExact.amountMinor) {
        remoteRateMoney = MoneyMapper.toMoney(zone.remoteRateExact);
      }
    } else {
      if (zone.freeShippingThreshold != null) {
        thresholdMoney = Money.fromLegacyNumber(zone.freeShippingThreshold, canonicalCurrency);
      } else if (zone.freeShippingThresholdExact && zone.freeShippingThresholdExact.amountMinor) {
        thresholdMoney = MoneyMapper.toMoney(zone.freeShippingThresholdExact);
      } else {
        thresholdMoney = Money.fromLegacyNumber(5000, canonicalCurrency);
      }

      if (zone.normalRate != null) {
        normalRateMoney = Money.fromLegacyNumber(zone.normalRate, canonicalCurrency);
      } else if (zone.normalRateExact && zone.normalRateExact.amountMinor) {
        normalRateMoney = MoneyMapper.toMoney(zone.normalRateExact);
      } else {
        normalRateMoney = Money.fromLegacyNumber(250, canonicalCurrency);
      }

      if (zone.remoteRate != null) {
        remoteRateMoney = Money.fromLegacyNumber(zone.remoteRate, canonicalCurrency);
      } else if (zone.remoteRateExact && zone.remoteRateExact.amountMinor) {
        remoteRateMoney = MoneyMapper.toMoney(zone.remoteRateExact);
      }
    }

    const remoteArea = Boolean(normalizedCity && zone.remoteCities && zone.remoteCities.some((value) => value.toLocaleLowerCase() === normalizedCity));
    const freeShippingApplied = !remoteArea && (subtotalMoney.amountMinor >= thresholdMoney.amountMinor);

    let shippingMoney;
    if (freeShippingApplied) {
      shippingMoney = Money.zero(canonicalCurrency);
    } else if (remoteArea && remoteRateMoney) {
      shippingMoney = remoteRateMoney;
    } else {
      shippingMoney = normalRateMoney;
    }

    // Weight multiplication if weight is specified
    if (weightKg > 1) {
      const excessKg = Math.ceil(weightKg - 1);
      const surcharge = shippingMoney.multiplyRational(excessKg * 10, 100, 'HALF_UP');
      shippingMoney = shippingMoney.add(surcharge);
    }

    const shippingAmount = Number(shippingMoney.toDecimalString());
    const shippingAmountExact = MoneyMapper.toPersistence(shippingMoney);

    if (effectiveMode === 'shadow_write' || effectiveMode === 'exact_read') {
      RolloutAuthority.assertWriteParity(shippingAmount, shippingAmountExact, effectiveMode, 'shipping');
    }

    return {
      eligible: true,
      market: { homeCountry: market.homeCountry, sellingMode: market.sellingMode },
      currency: canonicalCurrency,
      zone: { id: String(zone._id), name: zone.name },
      shippingAmount,
      shippingAmountExact,
      freeShippingApplied,
      deliveryMinDays: remoteArea && zone.remoteDeliveryMinDays != null ? zone.remoteDeliveryMinDays : zone.deliveryMinDays,
      deliveryMaxDays: remoteArea && zone.remoteDeliveryMaxDays != null ? zone.remoteDeliveryMaxDays : zone.deliveryMaxDays,
      remoteArea,
      postalCode: postalCode || undefined,
      reasonCode: null
    };
  }

  async calculate(address, afterDiscountAmount, currency = 'PKR') {
    const quote = await this.quote({
      country: address.country,
      currency,
      subtotal: afterDiscountAmount,
      city: address.city,
      region: address.province,
      postalCode: address.postalCode
    });
    return quote.shippingAmount;
  }
}

module.exports = new ShippingService();

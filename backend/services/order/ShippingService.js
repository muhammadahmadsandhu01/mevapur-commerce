const ShippingZone = require('../../models/ShippingZone');
const MarketService = require('../MarketService');
const { AppError } = require('../../common/errors/AppError');

class ShippingService {
  roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

  async ensureDemoZone(market) {
    if (market.homeCountry !== 'PK') return;
    const existing = await ShippingZone.exists({});
    if (!existing) {
      await ShippingZone.create([
        {
          name: 'Pakistan major cities', enabled: true, countries: ['PK'],
          cities: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad'],
          normalRate: 250, freeShippingThreshold: 5000, remoteRate: 350,
          deliveryMinDays: 2, deliveryMaxDays: 4,
          remoteDeliveryMinDays: 4, remoteDeliveryMaxDays: 7, priority: 10
        },
        {
          name: 'Pakistan standard delivery', enabled: true, countries: ['PK'],
          normalRate: 250, freeShippingThreshold: 5000, remoteRate: 350,
          deliveryMinDays: 3, deliveryMaxDays: 5,
          remoteDeliveryMinDays: 4, remoteDeliveryMaxDays: 7, priority: 100
        }
      ]);
    }
  }

  async quote({ country, currency, subtotal, city = '', region = '', postalCode = '' }) {
    const market = await MarketService.assertEligible({ country, currency });
    await this.ensureDemoZone(market);
    const zones = await ShippingZone.find({ enabled: true, countries: country }).sort({ priority: 1, _id: 1 });
    const normalizedCity = city.trim().toLocaleLowerCase();
    const normalizedRegion = region.trim().toLocaleLowerCase();
    const zone = zones.find((candidate) => (
      candidate.cities.length === 0 || candidate.cities.some((value) => value.toLocaleLowerCase() === normalizedCity)
    )) || zones.find((candidate) => (
      candidate.regions.length === 0 || candidate.regions.some((value) => value.toLocaleLowerCase() === normalizedRegion)
    ));
    if (!zone) throw new AppError('No shipping zone is available for this address', 409, 'SHIPPING_ZONE_UNAVAILABLE');
    const remoteArea = Boolean(normalizedCity && zone.remoteCities.some((value) => value.toLocaleLowerCase() === normalizedCity));
    const freeShippingApplied = !remoteArea && subtotal >= zone.freeShippingThreshold;
    const shippingAmount = freeShippingApplied ? 0 : this.roundMoney(remoteArea && zone.remoteRate != null ? zone.remoteRate : zone.normalRate);
    return {
      eligible: true, market: { homeCountry: market.homeCountry, sellingMode: market.sellingMode }, currency,
      zone: { id: String(zone._id), name: zone.name }, shippingAmount, freeShippingApplied,
      deliveryMinDays: remoteArea && zone.remoteDeliveryMinDays != null ? zone.remoteDeliveryMinDays : zone.deliveryMinDays,
      deliveryMaxDays: remoteArea && zone.remoteDeliveryMaxDays != null ? zone.remoteDeliveryMaxDays : zone.deliveryMaxDays,
      remoteArea, postalCode: postalCode || undefined, reasonCode: null
    };
  }

  async calculate(address, afterDiscountAmount, currency = 'PKR') {
    const quote = await this.quote({ country: address.country, currency, subtotal: afterDiscountAmount, city: address.city, region: address.province, postalCode: address.postalCode });
    return quote.shippingAmount;
  }
}

module.exports = new ShippingService();

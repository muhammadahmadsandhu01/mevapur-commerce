'use strict';

const { AppError } = require('../../common/errors/AppError');

/**
 * @class ShippingService
 * @description Legacy shipping authority adapter.
 * Direct ShippingZone rate calculation is disabled in governed runtime.
 * All shipping quotes and serviceability must be evaluated via CheckoutQuoteService
 * and ShippingServiceabilityService using active CommerceConfigurationVersion rules.
 */
class ShippingService {
  /**
   * Legacy quote method - disabled in governed runtime.
   * @throws {AppError} LEGACY_SHIPPING_CONFIGURATION_DISABLED (409)
   */
  async quote() {
    throw new AppError(
      'Direct legacy ShippingService quote is disabled. Use CheckoutQuoteService and ShippingServiceabilityService for governed shipping quotes.',
      409,
      'LEGACY_SHIPPING_CONFIGURATION_DISABLED'
    );
  }

  /**
   * Legacy calculate method - disabled in governed runtime.
   * @throws {AppError} LEGACY_SHIPPING_CONFIGURATION_DISABLED (409)
   */
  async calculate() {
    throw new AppError(
      'Direct legacy ShippingService calculation is disabled. Use CheckoutQuoteService and ShippingServiceabilityService for governed shipping calculations.',
      409,
      'LEGACY_SHIPPING_CONFIGURATION_DISABLED'
    );
  }
}

module.exports = new ShippingService();

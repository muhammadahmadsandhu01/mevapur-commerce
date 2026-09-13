/**
 * @file ShippingAdapterRegistry.js
 * @description Provider-Neutral Registry for Shipping Rate Adapters.
 */

const ManualTableShippingAdapter = require('./ManualTableShippingAdapter');
const { AppError } = require('../../../common/errors/AppError');

class ShippingAdapterRegistry {
  constructor() {
    this.adapters = new Map();
    // Register standard deterministic adapter by default
    const defaultAdapter = new ManualTableShippingAdapter();
    this.register('manual_table', defaultAdapter);
    this.defaultAdapterName = 'manual_table';
  }

  register(name, adapter) {
    if (!adapter || typeof adapter.quote !== 'function') {
      throw new Error(`Shipping adapter '${name}' must implement a quote() method`);
    }
    this.adapters.set(name, adapter);
  }

  get(name = null) {
    const target = name || this.defaultAdapterName;
    const adapter = this.adapters.get(target);
    if (!adapter) {
      throw new AppError(`Shipping adapter '${target}' is not registered or installed`, 503, 'SHIPPING_ADAPTER_UNAVAILABLE');
    }
    return adapter;
  }

  has(name) {
    return this.adapters.has(name);
  }
}

module.exports = new ShippingAdapterRegistry();
module.exports.ShippingAdapterRegistry = ShippingAdapterRegistry;

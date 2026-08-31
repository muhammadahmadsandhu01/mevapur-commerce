const { getRuntimeConfig } = require('./runtime.config');

module.exports = Object.freeze({
  displayName: 'HARZAAR',
  get mode() {
    return getRuntimeConfig().email.mode;
  },
  get smtp() {
    return getRuntimeConfig().email.smtp;
  },
  get brandName() {
    return getRuntimeConfig().email.brandName;
  },
  get frontendUrl() {
    return getRuntimeConfig().origins.storefront;
  }
});

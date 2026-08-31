const { getRuntimeConfig } = require('./runtime.config');

module.exports = Object.freeze({
  displayName: 'HARZAAR',
  get mode() {
    return getRuntimeConfig().email.mode;
  },
  get smtp() {
    return getRuntimeConfig().email.smtp;
  },
  get frontendUrl() {
    return getRuntimeConfig().origins.storefront;
  }
});

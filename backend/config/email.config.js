const { getRuntimeConfig } = require('./runtime.config');

module.exports = Object.freeze({
  displayName: 'HARZAAR',
  get mode() {
    return getRuntimeConfig().email.mode;
  },
  get frontendUrl() {
    return getRuntimeConfig().origins.storefront;
  }
});

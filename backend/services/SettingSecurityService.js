const ALLOWED_SETTING_PATHS = Object.freeze([
  'store.store_name',
  'store.store_email',
  'store.store_phone',
  'store.store_address',
  'store.currency',
  'shipping.shipping_flat_rate',
  'shipping.free_shipping_min',
  'shipping.delivery_days',
  'tax.tax_enabled',
  'tax.tax_rate',
  'payment.cod_enabled',
  'payment.jazzcash_enabled',
  'payment.jazzcash_merchant_id',
  'payment.visa_enabled',
  'payment.visa_merchant_id',
  'payment.mastercard_enabled',
  'payment.mastercard_merchant_id',
  'social.facebook',
  'social.instagram',
  'social.twitter',
  'social.youtube',
  'social.linkedin',
  'social.website',
  'storeName',
  'logo',
  'maintenanceMode'
]);

const LEGACY_PROVIDER_SECRET_PATHS = Object.freeze([
  'payment.jazzcash_password',
  'payment.visa_api_key',
  'payment.visa_secret_key',
  'payment.mastercard_api_key',
  'payment.mastercard_secret_key'
]);

const PROVIDER_CREDENTIAL_INPUT_PATHS = Object.freeze([
  ...LEGACY_PROVIDER_SECRET_PATHS,
  'payment.stripe_secret_key',
  'payment.stripe_webhook_secret',
  'payment.stripe_publishable_key',
  'providerCredentials'
]);

const PROVIDER_SECRET_EXCLUSION = Object.freeze(Object.fromEntries(
  LEGACY_PROVIDER_SECRET_PATHS.map((path) => [path, 0])
));

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const hasOwnPath = (source, path) => {
  const segments = path.split('.');
  let current = source;

  for (const segment of segments) {
    if (
      !isPlainObject(current)
      || !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return false;
    }
    current = current[segment];
  }

  return true;
};

const getPath = (source, path) => path
  .split('.')
  .reduce((current, segment) => current?.[segment], source);

const buildSettingsUpdate = (settingsData) => {
  if (!isPlainObject(settingsData)) return {};

  return ALLOWED_SETTING_PATHS.reduce((update, path) => {
    if (hasOwnPath(settingsData, path)) {
      update[path] = getPath(settingsData, path);
    }
    return update;
  }, {});
};

const containsProviderCredentialInput = (settingsData) => (
  isPlainObject(settingsData)
  && PROVIDER_CREDENTIAL_INPUT_PATHS.some((path) => hasOwnPath(settingsData, path))
);

const getUpdatedGroups = (settingsData) => {
  if (!isPlainObject(settingsData)) return [];
  const allowedGroups = new Set(ALLOWED_SETTING_PATHS.map((path) => path.split('.')[0]));
  return Object.keys(settingsData).filter((group) => allowedGroups.has(group));
};

module.exports = {
  ALLOWED_SETTING_PATHS,
  LEGACY_PROVIDER_SECRET_PATHS,
  PROVIDER_CREDENTIAL_INPUT_PATHS,
  PROVIDER_SECRET_EXCLUSION,
  buildSettingsUpdate,
  containsProviderCredentialInput,
  getUpdatedGroups
};

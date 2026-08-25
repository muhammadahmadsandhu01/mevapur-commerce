const SECRET_MASK = '************';

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
  'payment.jazzcash_password',
  'payment.visa_enabled',
  'payment.visa_merchant_id',
  'payment.visa_api_key',
  'payment.visa_secret_key',
  'payment.mastercard_enabled',
  'payment.mastercard_merchant_id',
  'payment.mastercard_api_key',
  'payment.mastercard_secret_key',
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

const SECRET_SETTING_PATHS = Object.freeze([
  'payment.jazzcash_password',
  'payment.visa_api_key',
  'payment.visa_secret_key',
  'payment.mastercard_api_key',
  'payment.mastercard_secret_key'
]);

const SECRET_SETTING_PATH_SET = new Set(SECRET_SETTING_PATHS);

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const hasOwnPath = (source, path) => {
  const segments = path.split('.');
  let current = source;

  for (const segment of segments) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }
    current = current[segment];
  }

  return true;
};

const getPath = (source, path) => path
  .split('.')
  .reduce((current, segment) => current?.[segment], source);

const setPath = (target, path, value) => {
  const segments = path.split('.');
  const finalSegment = segments.pop();
  let current = target;

  for (const segment of segments) {
    if (!isPlainObject(current[segment])) current[segment] = {};
    current = current[segment];
  }

  current[finalSegment] = value;
};

const deletePath = (target, path) => {
  const segments = path.split('.');
  const finalSegment = segments.pop();
  const parent = segments.reduce((current, segment) => current?.[segment], target);
  if (isPlainObject(parent)) delete parent[finalSegment];
};

const isPreservedSecretValue = (value) => (
  value === undefined
  || value === null
  || (typeof value === 'string' && (
    value.trim() === ''
    || value === SECRET_MASK
  ))
);

const buildSettingsUpdate = (settingsData) => {
  if (!isPlainObject(settingsData)) return {};

  return ALLOWED_SETTING_PATHS.reduce((update, path) => {
    if (!hasOwnPath(settingsData, path)) return update;

    const value = getPath(settingsData, path);
    if (SECRET_SETTING_PATH_SET.has(path) && isPreservedSecretValue(value)) {
      return update;
    }

    update[path] = value;
    return update;
  }, {});
};

const sanitizeSettings = (settings, { includeSecretIndicators = true } = {}) => {
  if (!settings) return settings;

  const result = typeof settings.toObject === 'function'
    ? settings.toObject()
    : JSON.parse(JSON.stringify(settings));

  for (const path of SECRET_SETTING_PATHS) {
    if (!includeSecretIndicators) {
      deletePath(result, path);
      continue;
    }

    const value = getPath(result, path);
    setPath(result, path, typeof value === 'string' && value.length > 0 ? SECRET_MASK : '');
  }

  return result;
};

const getUpdatedGroups = (settingsData) => {
  if (!isPlainObject(settingsData)) return [];
  const allowedGroups = new Set(ALLOWED_SETTING_PATHS.map((path) => path.split('.')[0]));
  return Object.keys(settingsData).filter((group) => allowedGroups.has(group));
};

module.exports = {
  ALLOWED_SETTING_PATHS,
  SECRET_MASK,
  SECRET_SETTING_PATHS,
  buildSettingsUpdate,
  getUpdatedGroups,
  sanitizeSettings
};

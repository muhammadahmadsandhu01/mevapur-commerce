/**
 * @file currencyRegistry.js
 * @description Versioned ISO 4217 Currency Metadata Registry for Global Commerce Core.
 *
 * PROVENANCE METADATA:
 * - Standard: ISO 4217 (Codes for the representation of currencies)
 * - Maintenance Agency: SIX Financial Information AG on behalf of ISO
 * - Source List One URL: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml (Published 2026-01-01)
 * - Source List One SHA-256: 838dfb991648cf36df939edd5fe3811737962b75a32252847d239cedd1e291c9
 * - Source List Three URL: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-three.xml (Published 2026-01-01)
 * - Source List Three SHA-256: 98fde2423cdb916dd59dcf5fe96222edad8fa198d865c1c83dbc464b9cc52387
 * - Snapshot Name: MevaPur currency snapshot 2026-09
 * - Retrieval Timestamp: 2026-09-11T17:55:00Z
 * - Commercial Classification Authority: MevaPur Commercial Eligibility Policy v1.0
 */

const CommerceError = require('../core/CommerceError');

const REGISTRY_PROVENANCE = Object.freeze({
  standard: 'ISO 4217',
  maintenanceAgency: 'SIX Financial Information AG',
  sourceListOneUrl: 'https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml',
  sourceListOnePublished: '2026-01-01',
  sourceListOneSha256: '838dfb991648cf36df939edd5fe3811737962b75a32252847d239cedd1e291c9',
  sourceListThreeUrl: 'https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-three.xml',
  sourceListThreePublished: '2026-01-01',
  sourceListThreeSha256: '98fde2423cdb916dd59dcf5fe96222edad8fa198d865c1c83dbc464b9cc52387',
  snapshotName: 'MevaPur currency snapshot 2026-09',
  retrievalTimestamp: '2026-09-11T17:55:00Z',
  publicationReference: 'ISO 4217 Currency and Funds Code List (Current & Historical)',
  snapshotDate: '2026-09-11',
  commercialPolicySnapshot: 'MevaPur Commercial Eligibility Policy v1.0'
});

/**
 * Currency Dataset
 * Format: [code, numericCode, exponent, name, type, status, commerciallyUsable]
 * type: 'fiat' | 'fund' | 'metal' | 'special' | 'test'
 * status: 'active' | 'deprecated'
 * commerciallyUsable: boolean
 * Note: Leading zeros in 3-character numeric codes are strictly preserved as strings.
 */
const RAW_CURRENCIES = [
  // 1. Active Commercial Fiat Currencies (Circulating Legal Tender from List One - 156 entries)
  ['AED', '784', 2, 'UAE Dirham', 'fiat', 'active', true],
  ['AFN', '971', 2, 'Afghani', 'fiat', 'active', true],
  ['ALL', '008', 2, 'Lek', 'fiat', 'active', true],
  ['AMD', '051', 2, 'Armenian Dram', 'fiat', 'active', true],
  ['AOA', '973', 2, 'Kwanza', 'fiat', 'active', true],
  ['ARS', '032', 2, 'Argentine Peso', 'fiat', 'active', true],
  ['AUD', '036', 2, 'Australian Dollar', 'fiat', 'active', true],
  ['AWG', '533', 2, 'Aruban Florin', 'fiat', 'active', true],
  ['AZN', '944', 2, 'Azerbaijan Manat', 'fiat', 'active', true],
  ['BAM', '977', 2, 'Convertible Mark', 'fiat', 'active', true],
  ['BBD', '052', 2, 'Barbados Dollar', 'fiat', 'active', true],
  ['BDT', '050', 2, 'Taka', 'fiat', 'active', true],
  ['BHD', '048', 3, 'Bahraini Dinar', 'fiat', 'active', true],
  ['BIF', '108', 0, 'Burundi Franc', 'fiat', 'active', true],
  ['BMD', '060', 2, 'Bermudian Dollar', 'fiat', 'active', true],
  ['BND', '096', 2, 'Brunei Dollar', 'fiat', 'active', true],
  ['BOB', '068', 2, 'Boliviano', 'fiat', 'active', true],
  ['BRL', '986', 2, 'Brazilian Real', 'fiat', 'active', true],
  ['BSD', '044', 2, 'Bahamian Dollar', 'fiat', 'active', true],
  ['BTN', '064', 2, 'Ngultrum', 'fiat', 'active', true],
  ['BWP', '072', 2, 'Pula', 'fiat', 'active', true],
  ['BYN', '933', 2, 'Belarusian Ruble', 'fiat', 'active', true],
  ['BZD', '084', 2, 'Belize Dollar', 'fiat', 'active', true],
  ['CAD', '124', 2, 'Canadian Dollar', 'fiat', 'active', true],
  ['CDF', '976', 2, 'Congolese Franc', 'fiat', 'active', true],
  ['CHF', '756', 2, 'Swiss Franc', 'fiat', 'active', true],
  ['CLP', '152', 0, 'Chilean Peso', 'fiat', 'active', true],
  ['CNY', '156', 2, 'Yuan Renminbi', 'fiat', 'active', true],
  ['COP', '170', 2, 'Colombian Peso', 'fiat', 'active', true],
  ['CRC', '188', 2, 'Costa Rican Colon', 'fiat', 'active', true],
  ['CUP', '192', 2, 'Cuban Peso', 'fiat', 'active', true],
  ['CVE', '132', 2, 'Cabo Verde Escudo', 'fiat', 'active', true],
  ['CZK', '203', 2, 'Czech Koruna', 'fiat', 'active', true],
  ['DJF', '262', 0, 'Djibouti Franc', 'fiat', 'active', true],
  ['DKK', '208', 2, 'Danish Krone', 'fiat', 'active', true],
  ['DOP', '214', 2, 'Dominican Peso', 'fiat', 'active', true],
  ['DZD', '012', 2, 'Algerian Dinar', 'fiat', 'active', true],
  ['EGP', '818', 2, 'Egyptian Pound', 'fiat', 'active', true],
  ['ERN', '232', 2, 'Nakfa', 'fiat', 'active', true],
  ['ETB', '230', 2, 'Ethiopian Birr', 'fiat', 'active', true],
  ['EUR', '978', 2, 'Euro', 'fiat', 'active', true],
  ['FJD', '242', 2, 'Fiji Dollar', 'fiat', 'active', true],
  ['FKP', '238', 2, 'Falkland Islands Pound', 'fiat', 'active', true],
  ['GBP', '826', 2, 'Pound Sterling', 'fiat', 'active', true],
  ['GEL', '981', 2, 'Lari', 'fiat', 'active', true],
  ['GHS', '936', 2, 'Ghana Cedi', 'fiat', 'active', true],
  ['GIP', '292', 2, 'Gibraltar Pound', 'fiat', 'active', true],
  ['GMD', '270', 2, 'Dalasi', 'fiat', 'active', true],
  ['GNF', '324', 0, 'Guinean Franc', 'fiat', 'active', true],
  ['GTQ', '320', 2, 'Quetzal', 'fiat', 'active', true],
  ['GYD', '328', 2, 'Guyana Dollar', 'fiat', 'active', true],
  ['HKD', '344', 2, 'Hong Kong Dollar', 'fiat', 'active', true],
  ['HNL', '340', 2, 'Lempira', 'fiat', 'active', true],
  ['HTG', '332', 2, 'Gourde', 'fiat', 'active', true],
  ['HUF', '348', 2, 'Forint', 'fiat', 'active', true],
  ['IDR', '360', 2, 'Rupiah', 'fiat', 'active', true],
  ['ILS', '376', 2, 'New Israeli Sheqel', 'fiat', 'active', true],
  ['INR', '356', 2, 'Indian Rupee', 'fiat', 'active', true],
  ['IQD', '368', 3, 'Iraqi Dinar', 'fiat', 'active', true],
  ['IRR', '364', 2, 'Iranian Rial', 'fiat', 'active', true],
  ['ISK', '352', 0, 'Iceland Krona', 'fiat', 'active', true],
  ['JMD', '388', 2, 'Jamaican Dollar', 'fiat', 'active', true],
  ['JOD', '400', 3, 'Jordanian Dinar', 'fiat', 'active', true],
  ['JPY', '392', 0, 'Yen', 'fiat', 'active', true],
  ['KES', '404', 2, 'Kenyan Shilling', 'fiat', 'active', true],
  ['KGS', '417', 2, 'Som', 'fiat', 'active', true],
  ['KHR', '116', 2, 'Riel', 'fiat', 'active', true],
  ['KMF', '174', 0, 'Comorian Franc', 'fiat', 'active', true],
  ['KPW', '408', 2, 'North Korean Won', 'fiat', 'active', true],
  ['KRW', '410', 0, 'Won', 'fiat', 'active', true],
  ['KWD', '414', 3, 'Kuwaiti Dinar', 'fiat', 'active', true],
  ['KYD', '136', 2, 'Cayman Islands Dollar', 'fiat', 'active', true],
  ['KZT', '398', 2, 'Tenge', 'fiat', 'active', true],
  ['LAK', '418', 2, 'Lao Kip', 'fiat', 'active', true],
  ['LBP', '422', 2, 'Lebanese Pound', 'fiat', 'active', true],
  ['LKR', '144', 2, 'Sri Lanka Rupee', 'fiat', 'active', true],
  ['LRD', '430', 2, 'Liberian Dollar', 'fiat', 'active', true],
  ['LSL', '426', 2, 'Loti', 'fiat', 'active', true],
  ['LYD', '434', 3, 'Libyan Dinar', 'fiat', 'active', true],
  ['MAD', '504', 2, 'Moroccan Dirham', 'fiat', 'active', true],
  ['MDL', '498', 2, 'Moldovan Leu', 'fiat', 'active', true],
  ['MGA', '969', 2, 'Malagasy Ariary', 'fiat', 'active', true],
  ['MKD', '807', 2, 'Denar', 'fiat', 'active', true],
  ['MMK', '104', 2, 'Kyat', 'fiat', 'active', true],
  ['MNT', '496', 2, 'Tugrik', 'fiat', 'active', true],
  ['MOP', '446', 2, 'Pataca', 'fiat', 'active', true],
  ['MRU', '929', 2, 'Ouguiya', 'fiat', 'active', true],
  ['MUR', '480', 2, 'Mauritius Rupee', 'fiat', 'active', true],
  ['MVR', '462', 2, 'Rufiyaa', 'fiat', 'active', true],
  ['MWK', '454', 2, 'Malawi Kwacha', 'fiat', 'active', true],
  ['MXN', '484', 2, 'Mexican Peso', 'fiat', 'active', true],
  ['MYR', '458', 2, 'Malaysian Ringgit', 'fiat', 'active', true],
  ['MZN', '943', 2, 'Mozambique Metical', 'fiat', 'active', true],
  ['NAD', '516', 2, 'Namibia Dollar', 'fiat', 'active', true],
  ['NGN', '566', 2, 'Naira', 'fiat', 'active', true],
  ['NIO', '558', 2, 'Cordoba Oro', 'fiat', 'active', true],
  ['NOK', '578', 2, 'Norwegian Krone', 'fiat', 'active', true],
  ['NPR', '524', 2, 'Nepalese Rupee', 'fiat', 'active', true],
  ['NZD', '554', 2, 'New Zealand Dollar', 'fiat', 'active', true],
  ['OMR', '512', 3, 'Rial Omani', 'fiat', 'active', true],
  ['PAB', '590', 2, 'Balboa', 'fiat', 'active', true],
  ['PEN', '604', 2, 'Sol', 'fiat', 'active', true],
  ['PGK', '598', 2, 'Kina', 'fiat', 'active', true],
  ['PHP', '608', 2, 'Philippine Peso', 'fiat', 'active', true],
  ['PKR', '586', 2, 'Pakistan Rupee', 'fiat', 'active', true],
  ['PLN', '985', 2, 'Zloty', 'fiat', 'active', true],
  ['PYG', '600', 0, 'Guarani', 'fiat', 'active', true],
  ['QAR', '634', 2, 'Qatari Rial', 'fiat', 'active', true],
  ['RON', '946', 2, 'Romanian Leu', 'fiat', 'active', true],
  ['RSD', '941', 2, 'Serbian Dinar', 'fiat', 'active', true],
  ['RUB', '643', 2, 'Russian Ruble', 'fiat', 'active', true],
  ['RWF', '646', 0, 'Rwanda Franc', 'fiat', 'active', true],
  ['SAR', '682', 2, 'Saudi Riyal', 'fiat', 'active', true],
  ['SBD', '090', 2, 'Solomon Islands Dollar', 'fiat', 'active', true],
  ['SCR', '690', 2, 'Seychelles Rupee', 'fiat', 'active', true],
  ['SDG', '938', 2, 'Sudanese Pound', 'fiat', 'active', true],
  ['SEK', '752', 2, 'Swedish Krona', 'fiat', 'active', true],
  ['SGD', '702', 2, 'Singapore Dollar', 'fiat', 'active', true],
  ['SHP', '654', 2, 'Saint Helena Pound', 'fiat', 'active', true],
  ['SLE', '925', 2, 'Leone', 'fiat', 'active', true],
  ['SOS', '706', 2, 'Somali Shilling', 'fiat', 'active', true],
  ['SRD', '968', 2, 'Surinam Dollar', 'fiat', 'active', true],
  ['SSP', '728', 2, 'South Sudanese Pound', 'fiat', 'active', true],
  ['STN', '930', 2, 'Dobra', 'fiat', 'active', true],
  ['SVC', '222', 2, 'El Salvador Colon', 'fiat', 'active', true],
  ['SYP', '760', 2, 'Syrian Pound', 'fiat', 'active', true],
  ['SZL', '748', 2, 'Lilangeni', 'fiat', 'active', true],
  ['THB', '764', 2, 'Baht', 'fiat', 'active', true],
  ['TJS', '972', 2, 'Somoni', 'fiat', 'active', true],
  ['TMT', '934', 2, 'Turkmenistan New Manat', 'fiat', 'active', true],
  ['TND', '788', 3, 'Tunisian Dinar', 'fiat', 'active', true],
  ['TOP', '776', 2, 'Pa’anga', 'fiat', 'active', true],
  ['TRY', '949', 2, 'Turkish Lira', 'fiat', 'active', true],
  ['TTD', '780', 2, 'Trinidad and Tobago Dollar', 'fiat', 'active', true],
  ['TWD', '901', 2, 'New Taiwan Dollar', 'fiat', 'active', true],
  ['TZS', '834', 2, 'Tanzanian Shilling', 'fiat', 'active', true],
  ['UAH', '980', 2, 'Hryvnia', 'fiat', 'active', true],
  ['UGX', '800', 0, 'Uganda Shilling', 'fiat', 'active', true],
  ['USD', '840', 2, 'US Dollar', 'fiat', 'active', true],
  ['UYU', '858', 2, 'Peso Uruguayo', 'fiat', 'active', true],
  ['UZS', '860', 2, 'Uzbekistan Sum', 'fiat', 'active', true],
  ['VED', '926', 2, 'Bolívar Soberano', 'fiat', 'active', true],
  ['VES', '928', 2, 'Bolívar Soberano', 'fiat', 'active', true],
  ['VND', '704', 0, 'Dong', 'fiat', 'active', true],
  ['VUV', '548', 0, 'Vatu', 'fiat', 'active', true],
  ['WST', '882', 2, 'Tala', 'fiat', 'active', true],
  ['XAD', '396', 2, 'Arab Accounting Dinar', 'fiat', 'active', true],
  ['XAF', '950', 0, 'CFA Franc BEAC', 'fiat', 'active', true],
  ['XCD', '951', 2, 'East Caribbean Dollar', 'fiat', 'active', true],
  ['XCG', '532', 2, 'Caribbean Guilder', 'fiat', 'active', true],
  ['XOF', '952', 0, 'CFA Franc BCEAO', 'fiat', 'active', true],
  ['XPF', '953', 0, 'CFP Franc', 'fiat', 'active', true],
  ['YER', '886', 2, 'Yemeni Rial', 'fiat', 'active', true],
  ['ZAR', '710', 2, 'Rand', 'fiat', 'active', true],
  ['ZMW', '967', 2, 'Zambian Kwacha', 'fiat', 'active', true],
  ['ZWG', '924', 2, 'Zimbabwe Gold', 'fiat', 'active', true],

  // 2. Funds & Accounting Units (Non-commercial for retail checkout from List One - 9 entries)
  ['BOV', '984', 2, 'Mvdol', 'fund', 'active', false],
  ['CHE', '947', 2, 'WIR Euro', 'fund', 'active', false],
  ['CHW', '948', 2, 'WIR Franc', 'fund', 'active', false],
  ['CLF', '990', 4, 'Unidad de Fomento', 'fund', 'active', false],
  ['COU', '970', 2, 'Unidad de Valor Real', 'fund', 'active', false],
  ['MXV', '979', 2, 'Mexican Unidad de Inversion (UDI)', 'fund', 'active', false],
  ['USN', '997', 2, 'US Dollar (Next day)', 'fund', 'active', false],
  ['UYI', '940', 0, 'Uruguay Peso en Unidades Indexadas (UI)', 'fund', 'active', false],
  ['UYW', '927', 4, 'Unidad Previsional', 'fund', 'active', false],

  // 3. Precious Metals (Non-commercial, exponent null from List One - 4 entries)
  ['XAG', '961', null, 'Silver', 'metal', 'active', false],
  ['XAU', '959', null, 'Gold', 'metal', 'active', false],
  ['XPD', '964', null, 'Palladium', 'metal', 'active', false],
  ['XPT', '962', null, 'Platinum', 'metal', 'active', false],

  // 4. Supranational / Special Purpose Units (Non-commercial from List One - 7 entries)
  ['XBA', '955', null, 'Bond Markets Unit European Composite Unit (EURCO)', 'special', 'active', false],
  ['XBB', '956', null, 'Bond Markets Unit European Monetary Unit (E.M.U.-6)', 'special', 'active', false],
  ['XBC', '957', null, 'Bond Markets Unit European Unit of Account 9 (E.U.A.-9)', 'special', 'active', false],
  ['XBD', '958', null, 'Bond Markets Unit European Unit of Account 17 (E.U.A.-17)', 'special', 'active', false],
  ['XDR', '960', null, 'SDR (Special Drawing Right)', 'special', 'active', false],
  ['XSU', '994', null, 'Sucre', 'special', 'active', false],
  ['XUA', '965', null, 'ADB Unit of Account', 'special', 'active', false],

  // 5. Testing & No-Currency Codes (from List One - 2 entries)
  ['XTS', '963', null, 'Codes specifically reserved for testing purposes', 'test', 'active', false],
  ['XXX', '999', null, 'The codes assigned for transactions where no currency is involved', 'test', 'active', false],

  // 6. Officially Deprecated Historical Currencies (Deliberate Supported Subset from List Three - 11 entries)
  ['BGN', '975', 2, 'Bulgarian Lev (Replaced by EUR)', 'fiat', 'deprecated', false],
  ['ZWL', '932', 2, 'Zimbabwean Dollar (Replaced by ZWG)', 'fiat', 'deprecated', false],
  ['ZWD', '716', 2, 'Zimbabwe Dollar (Historical)', 'fiat', 'deprecated', false],
  ['HRK', '191', 2, 'Croatian Kuna (Replaced by EUR)', 'fiat', 'deprecated', false],
  ['LTL', '440', 2, 'Lithuanian Litas (Replaced by EUR)', 'fiat', 'deprecated', false],
  ['LVL', '428', 2, 'Latvian Lats (Replaced by EUR)', 'fiat', 'deprecated', false],
  ['EEK', '233', 2, 'Estonian Kroon (Replaced by EUR)', 'fiat', 'deprecated', false],
  ['CYP', '196', 2, 'Cyprus Pound (Replaced by EUR)', 'fiat', 'deprecated', false],
  ['MTL', '470', 2, 'Maltese Lira (Replaced by EUR)', 'fiat', 'deprecated', false],
  ['SKK', '703', 2, 'Slovak Koruna (Replaced by EUR)', 'fiat', 'deprecated', false],
  ['SIT', '705', 2, 'Slovenian Tolar (Replaced by EUR)', 'fiat', 'deprecated', false],
];

const CURRENCY_MAP = new Map();
const NUMERIC_MAP = new Map();

for (const [code, numericCode, exponent, name, type, status, commerciallyUsable] of RAW_CURRENCIES) {
  if (CURRENCY_MAP.has(code)) {
    throw new Error(`Duplicate ISO 4217 alphabetic code in registry: ${code}`);
  }
  if (NUMERIC_MAP.has(numericCode)) {
    throw new Error(`Duplicate ISO 4217 numeric code in registry: ${numericCode} (${code})`);
  }
  if (exponent !== null && (!Number.isInteger(exponent) || exponent < 0 || exponent > 4)) {
    throw new Error(`Invalid minor-unit exponent for ${code}: ${exponent}`);
  }

  const entry = Object.freeze({
    code,
    numericCode,
    exponent,
    name,
    type,
    status,
    commerciallyUsable,
    provenance: REGISTRY_PROVENANCE
  });

  CURRENCY_MAP.set(code, entry);
  NUMERIC_MAP.set(numericCode, entry);
}

class CurrencyRegistry {
  /**
   * Resolves a currency by ISO 4217 alphabetic code or 3-digit numeric code.
   * @param {string|number} codeOrNumeric
   * @param {Object} [options={}]
   * @param {boolean} [options.allowDeprecated=false]
   * @param {boolean} [options.allowNonCommercial=false]
   * @returns {Object} Frozen currency metadata record
   */
  static getCurrency(codeOrNumeric, options = {}) {
    if (codeOrNumeric === undefined || codeOrNumeric === null) {
      throw CommerceError.currencyUnknown(codeOrNumeric);
    }

    const input = String(codeOrNumeric).trim();
    if (input.length === 0 || input.length > 3) {
      throw CommerceError.currencyUnknown(codeOrNumeric);
    }

    let entry;
    if (/^[0-9]+$/.test(input)) {
      const paddedNumeric = input.padStart(3, '0');
      entry = NUMERIC_MAP.get(paddedNumeric);
    } else {
      const normalizedAlpha = input.toUpperCase();
      entry = CURRENCY_MAP.get(normalizedAlpha);
    }

    if (!entry) {
      throw CommerceError.currencyUnknown(codeOrNumeric);
    }

    const allowDeprecated = Boolean(options.allowDeprecated);
    const allowNonCommercial = Boolean(options.allowNonCommercial);

    if (entry.status === 'deprecated') {
      if (!allowDeprecated) {
        throw CommerceError.currencyDeprecated(entry.code);
      }
    } else if (!entry.commerciallyUsable) {
      if (!allowNonCommercial) {
        throw CommerceError.currencyNonCommercial(entry.code);
      }
    }

    return entry;
  }

  /**
   * Alias for getCurrency
   */
  static get(code, options = {}) {
    return this.getCurrency(code, options);
  }

  /**
   * Resolves a currency by ISO 4217 3-digit numeric code.
   */
  static getByNumeric(numericCode, options = {}) {
    if (numericCode === undefined || numericCode === null) {
      throw CommerceError.currencyUnknown(numericCode);
    }
    const normalized = String(numericCode).trim().padStart(3, '0');
    return this.getCurrency(normalized, options);
  }

  /**
   * Resolves the minor-unit exponent for a currency code.
   * Throws if exponent is null/not_applicable unless handled.
   */
  static getExponent(code, options = {}) {
    const meta = this.getCurrency(code, options);
    if (meta.exponent === null) {
      throw new CommerceError(
        `Currency ${meta.code} has no standard minor-unit exponent (null)`,
        'COMMERCE_CURRENCY_INVALID_EXPONENT',
        400
      );
    }
    return meta.exponent;
  }

  /**
   * Checks if a currency code is recognized and permitted under given options.
   */
  static hasCurrency(code, options = {}) {
    try {
      this.getCurrency(code, options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns list of frozen currency objects matching filter criteria.
   * @param {Object} [options={}]
   * @param {string} [options.status='active'] - 'active' | 'deprecated' | 'all'
   * @param {boolean} [options.commercialOnly=true]
   * @returns {Object[]}
   */
  static listCurrencies(options = {}) {
    const statusFilter = options.status || 'active';
    const commercialOnly = options.commercialOnly !== false;

    const result = [];
    for (const entry of CURRENCY_MAP.values()) {
      if (statusFilter !== 'all' && entry.status !== statusFilter) {
        continue;
      }
      if (commercialOnly && !entry.commerciallyUsable) {
        continue;
      }
      result.push(entry);
    }

    return Object.freeze(result);
  }

  /**
   * Alias returning string currency codes.
   */
  static list(options = {}) {
    return Object.freeze(this.listCurrencies(options).map((c) => c.code).sort());
  }

  /**
   * Total number of registered currency entries.
   */
  static getRegisteredCount() {
    return CURRENCY_MAP.size;
  }

  /**
   * Programmatic mutually exclusive category reconciliation counts.
   * total === activeCommercial + funds + metals + specialPurpose + testingNoCurrency + deprecatedHistorical
   * @returns {Object}
   */
  static getCategoryCounts() {
    let activeCommercial = 0;
    let funds = 0;
    let metals = 0;
    let specialPurpose = 0;
    let testingNoCurrency = 0;
    let deprecatedHistorical = 0;
    let currentListOne = 0;

    for (const entry of CURRENCY_MAP.values()) {
      if (entry.status === 'deprecated') {
        deprecatedHistorical++;
      } else {
        currentListOne++;
        if (entry.type === 'fiat' && entry.commerciallyUsable) {
          activeCommercial++;
        } else if (entry.type === 'fund') {
          funds++;
        } else if (entry.type === 'metal') {
          metals++;
        } else if (entry.type === 'special') {
          specialPurpose++;
        } else if (entry.type === 'test') {
          testingNoCurrency++;
        }
      }
    }

    const total = CURRENCY_MAP.size;

    return Object.freeze({
      total,
      totalEntries: total,
      currentListOneEntries: currentListOne,
      activeCommercial,
      funds,
      metals,
      specialPurpose,
      testingNoCurrency,
      deprecatedHistorical
    });
  }

  /**
   * Returns registry provenance metadata.
   */
  static getRegistryProvenance() {
    return REGISTRY_PROVENANCE;
  }

  /**
   * Alias for getRegistryProvenance
   */
  static getProvenance() {
    return REGISTRY_PROVENANCE;
  }
}

module.exports = CurrencyRegistry;

/**
 * Authoritative Exact Money & Rational Arithmetic Utilities for Admin Panel
 * Handles minor-unit currency formatting and rational number serialization (numerator/denominator).
 */

export interface MoneyExact {
  amountMinor: string | number | bigint;
  currency: string;
  exponent?: number;
}

export interface FormatExactMoneyOptions {
  locale?: string;
  hideCurrency?: boolean;
}

const SUPPORTED_CURRENCY_EXPONENTS: Record<string, number> = {
  // Zero decimals (17 ISO currencies)
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three decimals (7 ISO currencies)
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // Four decimals (2 ISO currencies)
  CLF: 4, UYW: 4,
  // Standard two decimals (150 ISO currencies)
  AED: 2, AFN: 2, ALL: 2, AMD: 2, AOA: 2, ARS: 2, AUD: 2, AWG: 2, AZN: 2,
  BAM: 2, BBD: 2, BDT: 2, BGN: 2, BMD: 2, BND: 2, BOB: 2, BOV: 2, BRL: 2,
  BSD: 2, BTN: 2, BWP: 2, BYN: 2, BZD: 2, CAD: 2, CDF: 2, CHE: 2, CHF: 2,
  CHW: 2, CNY: 2, COP: 2, COU: 2, CRC: 2, CUP: 2, CVE: 2, CYP: 2, CZK: 2,
  DKK: 2, DOP: 2, DZD: 2, EEK: 2, EGP: 2, ERN: 2, ETB: 2, EUR: 2, FJD: 2,
  FKP: 2, GBP: 2, GEL: 2, GHS: 2, GIP: 2, GMD: 2, GTQ: 2, GYD: 2, HKD: 2,
  HNL: 2, HRK: 2, HTG: 2, HUF: 2, IDR: 2, ILS: 2, INR: 2, IRR: 2, JMD: 2,
  KES: 2, KGS: 2, KHR: 2, KPW: 2, KYD: 2, KZT: 2, LAK: 2, LBP: 2, LKR: 2,
  LRD: 2, LSL: 2, LTL: 2, LVL: 2, MAD: 2, MDL: 2, MGA: 2, MKD: 2, MMK: 2,
  MNT: 2, MOP: 2, MRU: 2, MTL: 2, MUR: 2, MVR: 2, MWK: 2, MXN: 2, MXV: 2,
  MYR: 2, MZN: 2, NAD: 2, NGN: 2, NIO: 2, NOK: 2, NPR: 2, NZD: 2, PAB: 2,
  PEN: 2, PGK: 2, PHP: 2, PKR: 2, PLN: 2, QAR: 2, RON: 2, RSD: 2, RUB: 2,
  SAR: 2, SBD: 2, SCR: 2, SDG: 2, SEK: 2, SGD: 2, SHP: 2, SIT: 2, SKK: 2,
  SLE: 2, SOS: 2, SRD: 2, SSP: 2, STN: 2, SVC: 2, SYP: 2, SZL: 2, THB: 2,
  TJS: 2, TMT: 2, TOP: 2, TRY: 2, TTD: 2, TWD: 2, TZS: 2, UAH: 2, USD: 2,
  USN: 2, UYU: 2, UZS: 2, VED: 2, VES: 2, WST: 2, XAD: 2, XCD: 2, XCG: 2,
  YER: 2, ZAR: 2, ZMW: 2, ZWD: 2, ZWG: 2, ZWL: 2
};

/**
 * Validates and normalizes minor-unit input to a clean integer string.
 * Rejects non-integers, floats, decimals, exponential notation, and invalid characters.
 */
export function normalizeMinorString(raw: string | number | bigint | null | undefined): string {
  if (raw === null || raw === undefined) {
    throw new Error('Minor amount is required');
  }

  let str: string;
  if (typeof raw === 'bigint') {
    str = raw.toString();
  } else if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
      throw new Error(`Invalid integer minor amount: ${raw}`);
    }
    str = String(raw);
  } else if (typeof raw === 'string') {
    str = raw.trim();
  } else {
    throw new Error('Unsupported minor amount type');
  }

  if (!/^-?\d+$/.test(str)) {
    throw new Error(`Invalid minor amount format: "${str}"`);
  }

  // Normalize negative zero "-0" -> "0"
  if (str === '-0' || /^-0+$/.test(str)) {
    return '0';
  }

  // Strip leading redundant zeros while preserving single "0" or "-0" -> "0"
  const isNegative = str.startsWith('-');
  const digits = isNegative ? str.slice(1) : str;
  const stripped = digits.replace(/^0+(?=\d)/, '');
  return isNegative && stripped !== '0' ? `-${stripped}` : (stripped || '0');
}

/**
 * Returns the authoritative exponent for an ISO currency code.
 * Fails safely if currency is unrecognized and no explicit server exponent is supplied.
 */
export function getCurrencyExponent(currency: string, explicitExponent?: number): number {
  if (typeof explicitExponent === 'number' && Number.isInteger(explicitExponent) && explicitExponent >= 0 && explicitExponent <= 4) {
    return explicitExponent;
  }
  const code = (currency || '').trim().toUpperCase();
  const exp = SUPPORTED_CURRENCY_EXPONENTS[code];
  if (typeof exp === 'number') {
    return exp;
  }
  throw new Error(`Unknown currency code "${currency}" with no authoritative exponent`);
}

/**
 * Fallback integer grouping separator (comma) if Intl is unavailable.
 */
function fallbackIntegerGrouping(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats exact serialized money safely without floating-point arithmetic.
 * Uses BigInt and Intl for locale-aware grouping and decimal separators.
 *
 * @param exact - Object containing amountMinor, currency, and optional exponent
 * @param options - Presentation options (locale, hideCurrency)
 */
export function formatExactMoney(
  exact: MoneyExact | null | undefined,
  options?: FormatExactMoneyOptions
): string {
  if (!exact) {
    return '—';
  }

  const currency = (exact.currency || 'PKR').trim().toUpperCase();
  const exponent = getCurrencyExponent(currency, exact.exponent);
  const minorStr = normalizeMinorString(exact.amountMinor);

  const isNegative = minorStr.startsWith('-');
  const unsignedMinor = isNegative ? minorStr.slice(1) : minorStr;

  let integerPart: string;
  let fractionalPart: string;

  if (exponent === 0) {
    integerPart = unsignedMinor || '0';
    fractionalPart = '';
  } else if (unsignedMinor.length <= exponent) {
    integerPart = '0';
    fractionalPart = unsignedMinor.padStart(exponent, '0');
  } else {
    const splitIdx = unsignedMinor.length - exponent;
    integerPart = unsignedMinor.slice(0, splitIdx) || '0';
    fractionalPart = unsignedMinor.slice(splitIdx);
  }

  const locale = options?.locale || 'en-US';
  let formattedInteger: string;
  let decimalSeparator = '.';

  try {
    const intBigInt = BigInt(integerPart);
    formattedInteger = new Intl.NumberFormat(locale, { useGrouping: true }).format(intBigInt);
    const parts = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).formatToParts(1.1);
    const decPart = parts.find((p) => p.type === 'decimal');
    if (decPart) {
      decimalSeparator = decPart.value;
    }
  } catch {
    formattedInteger = fallbackIntegerGrouping(integerPart);
  }

  const numberString = formattedInteger + (fractionalPart ? decimalSeparator + fractionalPart : '');
  const signedNumberString = (isNegative ? '-' : '') + numberString;

  if (options?.hideCurrency) {
    return signedNumberString;
  }

  // Determine locale-specific currency code placement
  let currencyAfter = false;
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code' }).formatToParts(1000);
    const currIdx = parts.findIndex((p) => p.type === 'currency');
    const intIdx = parts.findIndex((p) => p.type === 'integer');
    if (currIdx > intIdx) {
      currencyAfter = true;
    }
  } catch {
    currencyAfter = false;
  }

  if (currencyAfter) {
    return isNegative ? `-${numberString} ${currency}` : `${numberString} ${currency}`;
  }

  return isNegative ? `-${currency} ${numberString}` : `${currency} ${numberString}`;
}

/**
 * Exact deterministic equality comparison between two MoneyExact records.
 */
export function isExactMoneyEqual(
  a: MoneyExact | null | undefined,
  b: MoneyExact | null | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const currA = (a.currency || '').trim().toUpperCase();
  const currB = (b.currency || '').trim().toUpperCase();
  if (currA !== currB) return false;

  const expA = getCurrencyExponent(currA, a.exponent);
  const expB = getCurrencyExponent(currB, b.exponent);
  if (expA !== expB) return false;

  try {
    const minorA = normalizeMinorString(a.amountMinor);
    const minorB = normalizeMinorString(b.amountMinor);
    return minorA === minorB;
  } catch {
    return false;
  }
}

/**
 * Converts decimal input string into exact minor-unit integer representation.
 * E.g., for USD (exponent 2): "12.5" -> "1250", "0.99" -> "99", "5" -> "500"
 */
export function decimalToMinorString(decimalStr: string, exponent = 2): string {
  const clean = decimalStr.trim();
  if (!clean) return '0';

  if (!/^-?\d+(\.\d+)?$/.test(clean)) {
    throw new Error(`Invalid decimal amount format: "${clean}"`);
  }

  const isNegative = clean.startsWith('-');
  const unsigned = isNegative ? clean.slice(1) : clean;
  const [intPart = '0', fracPart = ''] = unsigned.split('.');

  const paddedFrac = fracPart.padEnd(exponent, '0').slice(0, exponent);
  const combined = `${intPart}${paddedFrac}`.replace(/^0+(?=\d)/, '');
  const result = combined || '0';

  return isNegative && result !== '0' ? `-${result}` : result;
}

/**
 * Formats a rational rate (numerator / denominator) as a human-friendly percentage string.
 * E.g., numerator: 1700, denominator: 10000 -> "17%"
 * numerator: 550, denominator: 10000 -> "5.5%"
 */
export function formatRationalPercentage(numerator: number, denominator = 10000): string {
  if (!denominator || denominator <= 0) return '0%';
  const rawPct = (numerator / denominator) * 100;
  return `${Number(rawPct.toFixed(4))}%`;
}

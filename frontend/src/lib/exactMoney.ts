/**
 * Authoritative Exact Money Formatting Utilities
 *
 * Implements strict string/BigInt-based currency formatting without converting
 * amountMinor to JavaScript Number or performing floating-point arithmetic.
 * Handles zero-, two-, and three-decimal currencies, negative numbers, and
 * values beyond Number.MAX_SAFE_INTEGER.
 */

export interface MoneyExact {
  amountMinor: string | number | bigint;
  currency: string;
  exponent?: number;
}

const SUPPORTED_CURRENCY_EXPONENTS: Record<string, number> = {
  // Zero decimals
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three decimals
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // Standard two decimals (defaults)
  PKR: 2, USD: 2, EUR: 2, GBP: 2, AED: 2, SAR: 2, CAD: 2, AUD: 2, CNY: 2, INR: 2
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
  return isNegative ? `-${stripped}` : stripped;
}

/**
 * Returns the authoritative exponent for an ISO currency code.
 */
export function getCurrencyExponent(currency: string, explicitExponent?: number): number {
  if (typeof explicitExponent === 'number' && Number.isInteger(explicitExponent) && explicitExponent >= 0 && explicitExponent <= 4) {
    return explicitExponent;
  }
  const code = (currency || '').trim().toUpperCase();
  return SUPPORTED_CURRENCY_EXPONENTS[code] !== undefined ? SUPPORTED_CURRENCY_EXPONENTS[code] : 2;
}

/**
 * Formats integer digits with thousands grouping separator (comma).
 */
function formatIntegerGrouping(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats exact serialized money safely without floating-point arithmetic.
 *
 * @param exact - Object containing amountMinor, currency, and optional exponent
 * @param options - Presentation options (hideCurrency)
 */
export function formatExactMoney(
  exact: MoneyExact | null | undefined,
  options?: { hideCurrency?: boolean }
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
    integerPart = unsignedMinor;
    fractionalPart = '';
  } else {
    if (unsignedMinor.length <= exponent) {
      integerPart = '0';
      fractionalPart = unsignedMinor.padStart(exponent, '0');
    } else {
      const splitIdx = unsignedMinor.length - exponent;
      integerPart = unsignedMinor.slice(0, splitIdx);
      fractionalPart = unsignedMinor.slice(splitIdx);
    }
  }

  const groupedInteger = formatIntegerGrouping(integerPart);
  const formattedAmount = (isNegative ? '-' : '') + (fractionalPart ? `${groupedInteger}.${fractionalPart}` : groupedInteger);

  if (options?.hideCurrency) {
    return formattedAmount;
  }

  return `${currency} ${formattedAmount}`;
}

/**
 * Exact deterministic equality comparison between two MoneyExact records.
 * Returns true only if currency, exponent, and integer minor string match exactly.
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

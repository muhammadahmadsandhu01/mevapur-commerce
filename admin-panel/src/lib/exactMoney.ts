/**
 * Authoritative Exact Money & Rational Arithmetic Utilities for Admin Panel
 * Handles minor-unit currency formatting and rational number serialization (numerator/denominator).
 */

export interface MoneyExact {
  amountMinor: string | number | bigint;
  currency: string;
  exponent?: number;
}

const SUPPORTED_CURRENCY_EXPONENTS: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  PKR: 2, USD: 2, EUR: 2, GBP: 2, AED: 2, SAR: 2, CAD: 2, AUD: 2, CNY: 2, INR: 2
};

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

  if (str === '-0' || /^-0+$/.test(str)) {
    return '0';
  }

  const isNegative = str.startsWith('-');
  const digits = isNegative ? str.slice(1) : str;
  const stripped = digits.replace(/^0+(?=\d)/, '');
  return isNegative ? `-${stripped}` : stripped;
}

export function getCurrencyExponent(currency: string, explicitExponent?: number): number {
  if (typeof explicitExponent === 'number' && Number.isInteger(explicitExponent) && explicitExponent >= 0 && explicitExponent <= 4) {
    return explicitExponent;
  }
  const code = (currency || '').trim().toUpperCase();
  return SUPPORTED_CURRENCY_EXPONENTS[code] !== undefined ? SUPPORTED_CURRENCY_EXPONENTS[code] : 2;
}

function formatIntegerGrouping(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatExactMoney(
  exact: MoneyExact | null | undefined,
  options?: { hideCurrency?: boolean }
): string {
  if (!exact) return '—';

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

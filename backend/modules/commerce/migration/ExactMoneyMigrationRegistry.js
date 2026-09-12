'use strict';

const crypto = require('crypto');
const CurrencyRegistry = require('../registries/currencyRegistry');
const CountryRegistry = require('../registries/countryRegistry');
const Money = require('../core/Money');
const Phone = require('../core/Phone');
const MoneyMapper = require('../persistence/MoneyMapper');
const CommerceError = require('../core/CommerceError');

const CANONICAL_MIGRATION_ID = 'phase4d-exact-money-migration';
const MIGRATION_TOOL_VERSION = '1.0.0';

/**
 * Resolves currency for a document following strict provenance hierarchy:
 * 1. Immutable currency already stored on the record
 * 2. Authoritative linked Order/Payment snapshot (if provided in options/context)
 * 3. Operator-provided legacy currency (if valid)
 * 4. null (unresolved)
 */
function resolveCurrency(doc, modelName, options = {}) {
  let currency = null;

  if (doc) {
    if (typeof doc.currency === 'string' && doc.currency.trim()) {
      currency = doc.currency.trim().toUpperCase();
    } else if (doc.payment && typeof doc.payment.currency === 'string' && doc.payment.currency.trim()) {
      currency = doc.payment.currency.trim().toUpperCase();
    } else if (doc.shippingAddress && typeof doc.shippingAddress.currency === 'string') {
      currency = doc.shippingAddress.currency.trim().toUpperCase();
    }
  }

  if (!currency && options.linkedCurrency && typeof options.linkedCurrency === 'string') {
    currency = options.linkedCurrency.trim().toUpperCase();
  }

  if (!currency && options.legacyCurrency && typeof options.legacyCurrency === 'string') {
    currency = options.legacyCurrency.trim().toUpperCase();
  }

  if (currency && CurrencyRegistry.has(currency)) {
    return currency;
  }

  return null;
}

/**
 * Resolves 2-letter ISO 3166-1 alpha-2 country code following provenance hierarchy:
 * 1. Normalized countryCode already stored on the record
 * 2. Unambiguous legacy country string
 * 3. Operator-provided legacy country
 * 4. null (unresolved)
 */
function resolveCountryCode(countryInput, options = {}) {
  if (countryInput && typeof countryInput === 'string') {
    const trimmed = countryInput.trim();
    if (/^[A-Za-z]{2}$/.test(trimmed)) {
      const code = trimmed.toUpperCase();
      if (CountryRegistry.has(code)) return code;
    }
    const upper = trimmed.toUpperCase();
    if (upper === 'PAKISTAN') return 'PK';
    if (upper === 'UNITED ARAB EMIRATES' || upper === 'UAE') return 'AE';
    if (upper === 'UNITED KINGDOM' || upper === 'UK' || upper === 'GREAT BRITAIN') return 'GB';
    if (upper === 'UNITED STATES' || upper === 'USA') return 'US';
    if (upper === 'GERMANY') return 'DE';

    try {
      const resolved = CountryRegistry.resolve(trimmed);
      if (resolved && resolved.alpha2) return resolved.alpha2;
    } catch {
      // Ignored, fallback to legacy country
    }
  }

  if (options.legacyCountry && typeof options.legacyCountry === 'string') {
    const code = options.legacyCountry.trim().toUpperCase();
    if (CountryRegistry.has(code)) return code;
  }

  return null;
}

/**
 * Normalizes phone number into E.164 and optional extension using Phone value object.
 */
function normalizePhone(rawPhone, countryCode) {
  if (!rawPhone || typeof rawPhone !== 'string' || !rawPhone.trim()) {
    return { phoneE164: '', phoneExtension: '' };
  }

  try {
    const parsed = Phone.parse(rawPhone.trim(), { defaultCountry: countryCode || 'PK' });
    return {
      phoneE164: parsed.e164 || '',
      phoneExtension: parsed.extension || ''
    };
  } catch {
    return { phoneE164: '', phoneExtension: '' };
  }
}

/**
 * Converts a legacy JavaScript numeric amount to an exact Money persistence snapshot.
 */
function convertToExactMoney(numericAmount, currency) {
  if (numericAmount === null || numericAmount === undefined) return null;
  if (typeof numericAmount !== 'number' || !Number.isFinite(numericAmount) || numericAmount < 0) {
    throw new CommerceError(
      `Invalid legacy amount: ${numericAmount}`,
      'COMMERCE_INVALID_LEGACY_AMOUNT',
      400
    );
  }

  const money = Money.fromLegacyNumber(numericAmount, currency);
  return MoneyMapper.toPersistence(money);
}

/**
 * Checks equality between an existing exact money subdocument and a computed exact money object.
 */
function exactMoneyMatches(existingExact, computedExact) {
  if (!existingExact || !computedExact) return false;
  if (existingExact.currency !== computedExact.currency) return false;
  if (Number(existingExact.exponent) !== Number(computedExact.exponent)) return false;

  const existingMinorStr = existingExact.amountMinor != null ? existingExact.amountMinor.toString().trim() : '';
  const computedMinorStr = computedExact.amountMinor != null ? computedExact.amountMinor.toString().trim() : '';

  return existingMinorStr === computedMinorStr;
}

/**
 * Computes SHA-256 fingerprint for a document's relevant state.
 */
function computeFingerprint(data) {
  const json = JSON.stringify(data, Object.keys(data || {}).sort());
  return crypto.createHash('sha256').update(json || '').digest('hex');
}

/**
 * Model Evaluators
 */
const MODEL_EVALUATORS = {
  products(doc, options = {}) {
    const currency = resolveCurrency(doc, 'products', options);
    if (!currency) {
      return { status: 'unresolved', reason: 'MISSING_CURRENCY', exactUpdates: {}, fieldsWritten: [] };
    }

    const updates = {};
    const fieldsWritten = [];
    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    // 1. costPrice -> costPriceExact (if costPrice != null)
    if (typeof doc.costPrice === 'number' && Number.isFinite(doc.costPrice)) {
      try {
        const exact = convertToExactMoney(doc.costPrice, currency);
        if (doc.costPriceExact) {
          if (!exactMoneyMatches(doc.costPriceExact, exact)) {
            hasConflict = true;
            conflictReason = `costPriceExact parity conflict (legacy: ${doc.costPrice}, exact: ${doc.costPriceExact.amountMinor})`;
          }
        } else {
          updates.costPriceExact = exact;
          fieldsWritten.push('costPriceExact');
          hasNewWrites = true;
        }
      } catch (err) {
        return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [] };
      }
    }

    // 2. price -> priceExact
    if (typeof doc.price === 'number' && Number.isFinite(doc.price)) {
      try {
        const exact = convertToExactMoney(doc.price, currency);
        if (doc.priceExact) {
          if (!exactMoneyMatches(doc.priceExact, exact)) {
            hasConflict = true;
            conflictReason = `priceExact parity conflict (legacy: ${doc.price}, exact: ${doc.priceExact.amountMinor})`;
          }
        } else {
          updates.priceExact = exact;
          fieldsWritten.push('priceExact');
          hasNewWrites = true;
        }
      } catch (err) {
        return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [] };
      }
    } else {
      return { status: 'unresolved', reason: 'INVALID_PRICE', exactUpdates: {}, fieldsWritten: [] };
    }

    // 3. originalPrice -> originalPriceExact
    if (typeof doc.originalPrice === 'number' && Number.isFinite(doc.originalPrice)) {
      try {
        const exact = convertToExactMoney(doc.originalPrice, currency);
        if (doc.originalPriceExact) {
          if (!exactMoneyMatches(doc.originalPriceExact, exact)) {
            hasConflict = true;
            conflictReason = `originalPriceExact parity conflict (legacy: ${doc.originalPrice}, exact: ${doc.originalPriceExact.amountMinor})`;
          }
        } else {
          updates.originalPriceExact = exact;
          fieldsWritten.push('originalPriceExact');
          hasNewWrites = true;
        }
      } catch (err) {
        return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [] };
      }
    }

    // 4. variants
    if (Array.isArray(doc.variants) && doc.variants.length > 0) {
      let variantsUpdated = false;
      const updatedVariants = doc.variants.map((v, idx) => {
        const vCopy = { ...(typeof v.toObject === 'function' ? v.toObject() : v) };
        if (typeof v.price === 'number' && Number.isFinite(v.price)) {
          const exact = convertToExactMoney(v.price, currency);
          if (v.priceExact) {
            if (!exactMoneyMatches(v.priceExact, exact)) {
              hasConflict = true;
              conflictReason = `variants[${idx}].priceExact parity conflict`;
            }
          } else {
            vCopy.priceExact = exact;
            fieldsWritten.push(`variants.${idx}.priceExact`);
            variantsUpdated = true;
          }
        }
        if (typeof v.salePrice === 'number' && Number.isFinite(v.salePrice) && v.salePrice > 0) {
          const exact = convertToExactMoney(v.salePrice, currency);
          if (v.salePriceExact) {
            if (!exactMoneyMatches(v.salePriceExact, exact)) {
              hasConflict = true;
              conflictReason = `variants[${idx}].salePriceExact parity conflict`;
            }
          } else {
            vCopy.salePriceExact = exact;
            fieldsWritten.push(`variants.${idx}.salePriceExact`);
            variantsUpdated = true;
          }
        }
        return vCopy;
      });

      if (variantsUpdated) {
        updates.variants = updatedVariants;
        hasNewWrites = true;
      }
    }

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [] };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [] };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten };
  },

  orders(doc, options = {}) {
    const currency = resolveCurrency(doc, 'orders', options);
    if (!currency) {
      return { status: 'unresolved', reason: 'MISSING_CURRENCY', exactUpdates: {}, fieldsWritten: [] };
    }

    const updates = {};
    const fieldsWritten = [];
    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    // Monetary fields
    const monetaryFields = [
      { legacy: 'subtotal', exact: 'subtotalExact' },
      { legacy: 'shippingCost', exact: 'shippingCostExact' },
      { legacy: 'taxAmount', exact: 'taxAmountExact' },
      { legacy: 'discount', exact: 'discountExact' },
      { legacy: 'totalAmount', exact: 'totalAmountExact' }
    ];

    for (const field of monetaryFields) {
      const val = doc[field.legacy];
      if (typeof val === 'number' && Number.isFinite(val)) {
        try {
          const exact = convertToExactMoney(val, currency);
          if (doc[field.exact]) {
            if (!exactMoneyMatches(doc[field.exact], exact)) {
              hasConflict = true;
              conflictReason = `${field.exact} parity conflict`;
            }
          } else {
            updates[field.exact] = exact;
            fieldsWritten.push(field.exact);
            hasNewWrites = true;
          }
        } catch (err) {
          return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [] };
        }
      }
    }

    // Order items
    if (Array.isArray(doc.items) && doc.items.length > 0) {
      let itemsUpdated = false;
      const updatedItems = doc.items.map((item, idx) => {
        const itemCopy = { ...(typeof item.toObject === 'function' ? item.toObject() : item) };
        if (typeof item.price === 'number' && Number.isFinite(item.price)) {
          const exact = convertToExactMoney(item.price, currency);
          if (item.unitPriceExact) {
            if (!exactMoneyMatches(item.unitPriceExact, exact)) {
              hasConflict = true;
              conflictReason = `items[${idx}].unitPriceExact parity conflict`;
            }
          } else {
            itemCopy.unitPriceExact = exact;
            fieldsWritten.push(`items.${idx}.unitPriceExact`);
            itemsUpdated = true;
          }
        }
        if (typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)) {
          const exact = convertToExactMoney(item.lineTotal, currency);
          if (item.lineTotalExact) {
            if (!exactMoneyMatches(item.lineTotalExact, exact)) {
              hasConflict = true;
              conflictReason = `items[${idx}].lineTotalExact parity conflict`;
            }
          } else {
            itemCopy.lineTotalExact = exact;
            fieldsWritten.push(`items.${idx}.lineTotalExact`);
            itemsUpdated = true;
          }
        }
        return itemCopy;
      });

      if (itemsUpdated) {
        updates.items = updatedItems;
        hasNewWrites = true;
      }
    }

    // Address normalization
    if (doc.shippingAddress) {
      const sa = doc.shippingAddress;
      const saUpdates = {};
      const countryCode = resolveCountryCode(sa.countryCode || sa.country, options);
      if (countryCode && sa.countryCode !== countryCode) {
        saUpdates['shippingAddress.countryCode'] = countryCode;
        fieldsWritten.push('shippingAddress.countryCode');
        hasNewWrites = true;
      }

      const adminArea = sa.administrativeArea || sa.province || sa.state || '';
      if (adminArea && sa.administrativeArea !== adminArea) {
        saUpdates['shippingAddress.administrativeArea'] = adminArea;
        fieldsWritten.push('shippingAddress.administrativeArea');
        hasNewWrites = true;
      }

      if (sa.phone && (!sa.phoneE164 || sa.phoneE164 === '')) {
        const normalized = normalizePhone(sa.phone, countryCode || 'PK');
        if (normalized.phoneE164) {
          saUpdates['shippingAddress.phoneE164'] = normalized.phoneE164;
          fieldsWritten.push('shippingAddress.phoneE164');
          if (normalized.phoneExtension) {
            saUpdates['shippingAddress.phoneExtension'] = normalized.phoneExtension;
            fieldsWritten.push('shippingAddress.phoneExtension');
          }
          hasNewWrites = true;
        }
      }

      Object.assign(updates, saUpdates);
    }

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [] };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [] };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten };
  },

  payments(doc, options = {}) {
    const currency = resolveCurrency(doc, 'payments', options);
    if (!currency) {
      return { status: 'unresolved', reason: 'MISSING_CURRENCY', exactUpdates: {}, fieldsWritten: [] };
    }

    const updates = {};
    const fieldsWritten = [];
    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    const fields = [
      { legacy: 'amount', exact: 'amountExact' },
      { legacy: 'paidAmount', exact: 'paidAmountExact' },
      { legacy: 'refundedAmount', exact: 'refundedAmountExact' },
      { legacy: 'refundReservedAmount', exact: 'refundReservedAmountExact' }
    ];

    for (const f of fields) {
      const val = doc[f.legacy];
      if (typeof val === 'number' && Number.isFinite(val)) {
        try {
          const exact = convertToExactMoney(val, currency);
          if (doc[f.exact]) {
            if (!exactMoneyMatches(doc[f.exact], exact)) {
              hasConflict = true;
              conflictReason = `${f.exact} parity conflict`;
            }
          } else {
            updates[f.exact] = exact;
            fieldsWritten.push(f.exact);
            hasNewWrites = true;
          }
        } catch (err) {
          return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [] };
        }
      }
    }

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [] };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [] };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten };
  },

  refunds(doc, options = {}) {
    const currency = resolveCurrency(doc, 'refunds', options);
    if (!currency) {
      return { status: 'unresolved', reason: 'MISSING_CURRENCY', exactUpdates: {}, fieldsWritten: [] };
    }

    const updates = {};
    const fieldsWritten = [];

    if (typeof doc.amount === 'number' && Number.isFinite(doc.amount)) {
      try {
        const exact = convertToExactMoney(doc.amount, currency);
        if (doc.amountExact) {
          if (!exactMoneyMatches(doc.amountExact, exact)) {
            return {
              status: 'conflict',
              reason: `amountExact parity conflict (legacy: ${doc.amount}, exact: ${doc.amountExact.amountMinor})`,
              exactUpdates: {},
              fieldsWritten: []
            };
          }
          return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [] };
        } else {
          updates.amountExact = exact;
          fieldsWritten.push('amountExact');
          return { status: 'would_update', exactUpdates: updates, fieldsWritten };
        }
      } catch (err) {
        return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [] };
      }
    }

    return { status: 'unresolved', reason: 'INVALID_REFUND_AMOUNT', exactUpdates: {}, fieldsWritten: [] };
  },

  returns(doc, options = {}) {
    const currency = resolveCurrency(doc, 'returns', options);
    if (!currency) {
      return { status: 'unresolved', reason: 'MISSING_CURRENCY', exactUpdates: {}, fieldsWritten: [] };
    }

    const updates = {};
    const fieldsWritten = [];
    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    if (typeof doc.refundAmount === 'number' && Number.isFinite(doc.refundAmount)) {
      const exact = convertToExactMoney(doc.refundAmount, currency);
      if (doc.refundAmountExact) {
        if (!exactMoneyMatches(doc.refundAmountExact, exact)) {
          hasConflict = true;
          conflictReason = 'refundAmountExact parity conflict';
        }
      } else {
        updates.refundAmountExact = exact;
        fieldsWritten.push('refundAmountExact');
        hasNewWrites = true;
      }
    }

    if (typeof doc.shippingCost === 'number' && Number.isFinite(doc.shippingCost)) {
      const exact = convertToExactMoney(doc.shippingCost, currency);
      if (doc.shippingCostExact) {
        if (!exactMoneyMatches(doc.shippingCostExact, exact)) {
          hasConflict = true;
          conflictReason = 'shippingCostExact parity conflict';
        }
      } else {
        updates.shippingCostExact = exact;
        fieldsWritten.push('shippingCostExact');
        hasNewWrites = true;
      }
    }

    if (Array.isArray(doc.items) && doc.items.length > 0) {
      let itemsUpdated = false;
      const updatedItems = doc.items.map((item, idx) => {
        const itemCopy = { ...(typeof item.toObject === 'function' ? item.toObject() : item) };
        if (typeof item.price === 'number' && Number.isFinite(item.price)) {
          const exact = convertToExactMoney(item.price, currency);
          if (item.priceExact) {
            if (!exactMoneyMatches(item.priceExact, exact)) {
              hasConflict = true;
              conflictReason = `items[${idx}].priceExact parity conflict`;
            }
          } else {
            itemCopy.priceExact = exact;
            fieldsWritten.push(`items.${idx}.priceExact`);
            itemsUpdated = true;
          }
        }
        if (typeof item.refundAmount === 'number' && Number.isFinite(item.refundAmount)) {
          const exact = convertToExactMoney(item.refundAmount, currency);
          if (item.refundAmountExact) {
            if (!exactMoneyMatches(item.refundAmountExact, exact)) {
              hasConflict = true;
              conflictReason = `items[${idx}].refundAmountExact parity conflict`;
            }
          } else {
            itemCopy.refundAmountExact = exact;
            fieldsWritten.push(`items.${idx}.refundAmountExact`);
            itemsUpdated = true;
          }
        }
        return itemCopy;
      });

      if (itemsUpdated) {
        updates.items = updatedItems;
        hasNewWrites = true;
      }
    }

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [] };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [] };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten };
  },

  coupons(doc, options = {}) {
    const currency = resolveCurrency(doc, 'coupons', options);
    if (!currency) {
      return { status: 'unresolved', reason: 'MISSING_CURRENCY', exactUpdates: {}, fieldsWritten: [] };
    }

    const updates = {};
    const fieldsWritten = [];
    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    // Fixed-value coupons get valueExact; percentage coupons MUST NOT have valueExact
    if (doc.type === 'fixed' && typeof doc.value === 'number' && Number.isFinite(doc.value)) {
      const exact = convertToExactMoney(doc.value, currency);
      if (doc.valueExact) {
        if (!exactMoneyMatches(doc.valueExact, exact)) {
          hasConflict = true;
          conflictReason = 'valueExact parity conflict for fixed coupon';
        }
      } else {
        updates.valueExact = exact;
        fieldsWritten.push('valueExact');
        hasNewWrites = true;
      }
    }

    if (typeof doc.minOrderAmount === 'number' && Number.isFinite(doc.minOrderAmount) && doc.minOrderAmount > 0) {
      const exact = convertToExactMoney(doc.minOrderAmount, currency);
      if (doc.minOrderAmountExact) {
        if (!exactMoneyMatches(doc.minOrderAmountExact, exact)) {
          hasConflict = true;
          conflictReason = 'minOrderAmountExact parity conflict';
        }
      } else {
        updates.minOrderAmountExact = exact;
        fieldsWritten.push('minOrderAmountExact');
        hasNewWrites = true;
      }
    }

    if (typeof doc.maxDiscount === 'number' && Number.isFinite(doc.maxDiscount) && doc.maxDiscount > 0) {
      const exact = convertToExactMoney(doc.maxDiscount, currency);
      if (doc.maxDiscountExact) {
        if (!exactMoneyMatches(doc.maxDiscountExact, exact)) {
          hasConflict = true;
          conflictReason = 'maxDiscountExact parity conflict';
        }
      } else {
        updates.maxDiscountExact = exact;
        fieldsWritten.push('maxDiscountExact');
        hasNewWrites = true;
      }
    }

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [] };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [] };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten };
  },

  shipping_zones(doc, options = {}) {
    const currency = resolveCurrency(doc, 'shipping_zones', options);
    if (!currency) {
      return { status: 'unresolved', reason: 'MISSING_CURRENCY', exactUpdates: {}, fieldsWritten: [] };
    }

    const updates = {};
    const fieldsWritten = [];
    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    if (typeof doc.normalRate === 'number' && Number.isFinite(doc.normalRate)) {
      const exact = convertToExactMoney(doc.normalRate, currency);
      if (doc.normalRateExact) {
        if (!exactMoneyMatches(doc.normalRateExact, exact)) {
          hasConflict = true;
          conflictReason = 'normalRateExact parity conflict';
        }
      } else {
        updates.normalRateExact = exact;
        fieldsWritten.push('normalRateExact');
        hasNewWrites = true;
      }
    }

    if (typeof doc.freeShippingThreshold === 'number' && Number.isFinite(doc.freeShippingThreshold)) {
      const exact = convertToExactMoney(doc.freeShippingThreshold, currency);
      if (doc.freeShippingThresholdExact) {
        if (!exactMoneyMatches(doc.freeShippingThresholdExact, exact)) {
          hasConflict = true;
          conflictReason = 'freeShippingThresholdExact parity conflict';
        }
      } else {
        updates.freeShippingThresholdExact = exact;
        fieldsWritten.push('freeShippingThresholdExact');
        hasNewWrites = true;
      }
    }

    if (typeof doc.remoteRate === 'number' && Number.isFinite(doc.remoteRate)) {
      const exact = convertToExactMoney(doc.remoteRate, currency);
      if (doc.remoteRateExact) {
        if (!exactMoneyMatches(doc.remoteRateExact, exact)) {
          hasConflict = true;
          conflictReason = 'remoteRateExact parity conflict';
        }
      } else {
        updates.remoteRateExact = exact;
        fieldsWritten.push('remoteRateExact');
        hasNewWrites = true;
      }
    }

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [] };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [] };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten };
  },

  users(doc, options = {}) {
    const updates = {};
    const fieldsWritten = [];
    let hasNewWrites = false;

    if (Array.isArray(doc.addresses) && doc.addresses.length > 0) {
      let addressesUpdated = false;
      const updatedAddresses = doc.addresses.map((addr, idx) => {
        const addrCopy = { ...(typeof addr.toObject === 'function' ? addr.toObject() : addr) };
        const countryCode = resolveCountryCode(addr.countryCode || addr.country, options);
        if (countryCode && addr.countryCode !== countryCode) {
          addrCopy.countryCode = countryCode;
          fieldsWritten.push(`addresses.${idx}.countryCode`);
          addressesUpdated = true;
        }

        const adminArea = addr.administrativeArea || addr.state || addr.province || '';
        if (adminArea && addr.administrativeArea !== adminArea) {
          addrCopy.administrativeArea = adminArea;
          fieldsWritten.push(`addresses.${idx}.administrativeArea`);
          addressesUpdated = true;
        }

        if (addr.phone && (!addr.phoneE164 || addr.phoneE164 === '')) {
          const normalized = normalizePhone(addr.phone, countryCode || 'PK');
          if (normalized.phoneE164) {
            addrCopy.phoneE164 = normalized.phoneE164;
            fieldsWritten.push(`addresses.${idx}.phoneE164`);
            if (normalized.phoneExtension) {
              addrCopy.phoneExtension = normalized.phoneExtension;
              fieldsWritten.push(`addresses.${idx}.phoneExtension`);
            }
            addressesUpdated = true;
          }
        }

        return addrCopy;
      });

      if (addressesUpdated) {
        updates.addresses = updatedAddresses;
        hasNewWrites = true;
      }
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [] };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten };
  }
};

module.exports = {
  CANONICAL_MIGRATION_ID,
  MIGRATION_TOOL_VERSION,
  resolveCurrency,
  resolveCountryCode,
  normalizePhone,
  convertToExactMoney,
  exactMoneyMatches,
  computeFingerprint,
  evaluateDocument(doc, modelName, options = {}) {
    const evaluator = MODEL_EVALUATORS[modelName];
    if (!evaluator) {
      throw new CommerceError(
        `Unknown model evaluator for '${modelName}'`,
        'COMMERCE_UNKNOWN_MIGRATION_MODEL',
        400
      );
    }
    return evaluator(doc, options);
  }
};

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
 * 1. Authoritative linked Order/Payment snapshot (if provided by service from linked doc)
 * 2. Immutable currency already stored on the record
 * 3. Operator-provided legacy currency (if valid)
 * 4. null (unresolved)
 */
function resolveCurrency(doc, modelName, options = {}) {
  let currency = null;

  if (options.linkedCurrency && typeof options.linkedCurrency === 'string') {
    currency = options.linkedCurrency.trim().toUpperCase();
  } else if (doc) {
    const raw = doc._doc ? doc._doc : (typeof doc.toObject === 'function' ? doc.toObject() : doc);
    if (typeof raw.currency === 'string' && raw.currency.trim()) {
      currency = raw.currency.trim().toUpperCase();
    } else if (raw.payment && typeof raw.payment.currency === 'string' && raw.payment.currency.trim()) {
      currency = raw.payment.currency.trim().toUpperCase();
    } else if (raw.shippingAddress && typeof raw.shippingAddress.currency === 'string') {
      currency = raw.shippingAddress.currency.trim().toUpperCase();
    }
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
 * Deterministic canonical serialization supporting Decimal128, ObjectId, Date, Arrays, and sorted Keys.
 */
function canonicalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
  if (typeof val === 'bigint') return val.toString();
  if (val instanceof Date) return val.toISOString();
  if (val._bsontype === 'Decimal128' || (val.constructor && val.constructor.name === 'Decimal128')) {
    return val.toString();
  }
  if (val._bsontype === 'ObjectId' || (val.constructor && val.constructor.name === 'ObjectId')) {
    return val.toString();
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  if (typeof val === 'object') {
    const obj = val._doc ? val._doc : (typeof val.toObject === 'function' ? val.toObject() : val);
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalizeValue(obj[key]);
    }
    return sorted;
  }
  return String(val);
}

/**
 * Computes deterministic SHA-256 fingerprint for canonical state.
 */
function computeFingerprint(data) {
  const canon = canonicalizeValue(data);
  const json = JSON.stringify(canon);
  return crypto.createHash('sha256').update(json || '').digest('hex');
}

/**
 * Model Evaluators
 */
const MODEL_EVALUATORS = {
  products(doc, options = {}) {
    const currency = resolveCurrency(doc, 'products', options);
    const fieldStats = {
      eligible: 0,
      compliant: 0,
      wouldBackfill: 0,
      conflicts: 0,
      unresolved: 0,
      inapplicable: 0
    };

    // Count eligible fields
    if (typeof doc.price === 'number' && Number.isFinite(doc.price)) fieldStats.eligible++;
    if (typeof doc.costPrice === 'number' && Number.isFinite(doc.costPrice) && doc.costPrice > 0) fieldStats.eligible++;
    if (typeof doc.originalPrice === 'number' && Number.isFinite(doc.originalPrice) && doc.originalPrice > 0) fieldStats.eligible++;
    if (Array.isArray(doc.variants)) {
      doc.variants.forEach(v => {
        if (typeof v.price === 'number' && Number.isFinite(v.price)) fieldStats.eligible++;
        if (typeof v.salePrice === 'number' && Number.isFinite(v.salePrice) && v.salePrice > 0) fieldStats.eligible++;
      });
    }

    if (!currency) {
      fieldStats.unresolved = fieldStats.eligible;
      return {
        status: 'unresolved',
        reason: 'MISSING_CURRENCY',
        exactUpdates: {},
        fieldsWritten: [],
        fieldStats,
        casFilter: { _id: doc._id },
        preconditionFingerprint: computeFingerprint({ id: String(doc._id), currency: null }),
        postWriteFingerprint: computeFingerprint({})
      };
    }

    const updates = {};
    const fieldsWritten = [];
    const casFilter = { _id: doc._id };
    if (doc.__v !== undefined) casFilter.__v = doc.__v;

    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    // 1. costPrice
    if (typeof doc.costPrice === 'number' && Number.isFinite(doc.costPrice) && doc.costPrice > 0) {
      casFilter.costPrice = doc.costPrice;
      try {
        const exact = convertToExactMoney(doc.costPrice, currency);
        if (doc.costPriceExact) {
          if (!exactMoneyMatches(doc.costPriceExact, exact)) {
            hasConflict = true;
            conflictReason = `costPriceExact parity conflict (legacy: ${doc.costPrice}, exact: ${doc.costPriceExact.amountMinor})`;
            fieldStats.conflicts++;
          } else {
            fieldStats.compliant++;
          }
        } else {
          casFilter.costPriceExact = null;
          updates.costPriceExact = exact;
          fieldsWritten.push('costPriceExact');
          hasNewWrites = true;
          fieldStats.wouldBackfill++;
        }
      } catch (err) {
        fieldStats.unresolved++;
        return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter };
      }
    }

    // 2. price
    if (typeof doc.price === 'number' && Number.isFinite(doc.price)) {
      casFilter.price = doc.price;
      try {
        const exact = convertToExactMoney(doc.price, currency);
        if (doc.priceExact) {
          if (!exactMoneyMatches(doc.priceExact, exact)) {
            hasConflict = true;
            conflictReason = `priceExact parity conflict (legacy: ${doc.price}, exact: ${doc.priceExact.amountMinor})`;
            fieldStats.conflicts++;
          } else {
            fieldStats.compliant++;
          }
        } else {
          casFilter.priceExact = null;
          updates.priceExact = exact;
          fieldsWritten.push('priceExact');
          hasNewWrites = true;
          fieldStats.wouldBackfill++;
        }
      } catch (err) {
        fieldStats.unresolved++;
        return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter };
      }
    } else {
      fieldStats.unresolved++;
      return { status: 'unresolved', reason: 'INVALID_PRICE', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter };
    }

    // 3. originalPrice
    if (typeof doc.originalPrice === 'number' && Number.isFinite(doc.originalPrice) && doc.originalPrice > 0) {
      casFilter.originalPrice = doc.originalPrice;
      try {
        const exact = convertToExactMoney(doc.originalPrice, currency);
        if (doc.originalPriceExact) {
          if (!exactMoneyMatches(doc.originalPriceExact, exact)) {
            hasConflict = true;
            conflictReason = `originalPriceExact parity conflict (legacy: ${doc.originalPrice}, exact: ${doc.originalPriceExact.amountMinor})`;
            fieldStats.conflicts++;
          } else {
            fieldStats.compliant++;
          }
        } else {
          casFilter.originalPriceExact = null;
          updates.originalPriceExact = exact;
          fieldsWritten.push('originalPriceExact');
          hasNewWrites = true;
          fieldStats.wouldBackfill++;
        }
      } catch (err) {
        fieldStats.unresolved++;
        return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter };
      }
    }

    // 4. variants
    if (Array.isArray(doc.variants) && doc.variants.length > 0) {
      casFilter.variants = { $size: doc.variants.length };
      let variantsUpdated = false;
      const updatedVariants = doc.variants.map((v, idx) => {
        const vCopy = { ...(typeof v.toObject === 'function' ? v.toObject() : v) };
        if (typeof v.price === 'number' && Number.isFinite(v.price)) {
          const exact = convertToExactMoney(v.price, currency);
          if (v.priceExact) {
            if (!exactMoneyMatches(v.priceExact, exact)) {
              hasConflict = true;
              conflictReason = `variants[${idx}].priceExact parity conflict`;
              fieldStats.conflicts++;
            } else {
              fieldStats.compliant++;
            }
          } else {
            vCopy.priceExact = exact;
            fieldsWritten.push(`variants.${idx}.priceExact`);
            variantsUpdated = true;
            fieldStats.wouldBackfill++;
          }
        }
        if (typeof v.salePrice === 'number' && Number.isFinite(v.salePrice) && v.salePrice > 0) {
          const exact = convertToExactMoney(v.salePrice, currency);
          if (v.salePriceExact) {
            if (!exactMoneyMatches(v.salePriceExact, exact)) {
              hasConflict = true;
              conflictReason = `variants[${idx}].salePriceExact parity conflict`;
              fieldStats.conflicts++;
            } else {
              fieldStats.compliant++;
            }
          } else {
            vCopy.salePriceExact = exact;
            fieldsWritten.push(`variants.${idx}.salePriceExact`);
            variantsUpdated = true;
            fieldStats.wouldBackfill++;
          }
        }
        return vCopy;
      });

      if (variantsUpdated) {
        updates.variants = updatedVariants;
        hasNewWrites = true;
      }
    }

    const preFingerprint = computeFingerprint({
      id: String(doc._id),
      currency,
      price: doc.price,
      costPrice: doc.costPrice,
      originalPrice: doc.originalPrice,
      priceExact: doc.priceExact,
      costPriceExact: doc.costPriceExact,
      originalPriceExact: doc.originalPriceExact,
      variants: (doc.variants || []).map(v => ({
        _id: v._id ? String(v._id) : undefined,
        sku: v.sku,
        price: v.price,
        salePrice: v.salePrice,
        priceExact: v.priceExact,
        salePriceExact: v.salePriceExact
      }))
    });

    const postFingerprint = computeFingerprint(updates);

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten, fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
  },

  orders(doc, options = {}) {
    const currency = resolveCurrency(doc, 'orders', options);
    const fieldStats = {
      eligible: 0,
      compliant: 0,
      wouldBackfill: 0,
      conflicts: 0,
      unresolved: 0,
      inapplicable: 0
    };

    const monetaryFields = [
      { legacy: 'subtotal', exact: 'subtotalExact' },
      { legacy: 'shippingCost', exact: 'shippingCostExact' },
      { legacy: 'taxAmount', exact: 'taxAmountExact' },
      { legacy: 'discount', exact: 'discountExact' },
      { legacy: 'totalAmount', exact: 'totalAmountExact' }
    ];

    for (const f of monetaryFields) {
      if (typeof doc[f.legacy] === 'number' && Number.isFinite(doc[f.legacy])) fieldStats.eligible++;
    }

    if (Array.isArray(doc.items)) {
      doc.items.forEach(item => {
        if (typeof item.price === 'number' && Number.isFinite(item.price)) fieldStats.eligible++;
        if (typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)) fieldStats.eligible++;
      });
    }

    if (doc.shippingAddress) {
      if (doc.shippingAddress.country || doc.shippingAddress.countryCode) fieldStats.eligible++;
      if (doc.shippingAddress.province || doc.shippingAddress.state || doc.shippingAddress.administrativeArea) fieldStats.eligible++;
      if (doc.shippingAddress.phone) fieldStats.eligible++;
    }

    if (!currency) {
      fieldStats.unresolved = fieldStats.eligible;
      return {
        status: 'unresolved',
        reason: 'MISSING_CURRENCY',
        exactUpdates: {},
        fieldsWritten: [],
        fieldStats,
        casFilter: { _id: doc._id },
        preconditionFingerprint: computeFingerprint({ id: String(doc._id), currency: null }),
        postWriteFingerprint: computeFingerprint({})
      };
    }

    const updates = {};
    const fieldsWritten = [];
    const casFilter = { _id: doc._id };
    if (doc.__v !== undefined) casFilter.__v = doc.__v;

    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    // Monetary fields
    for (const field of monetaryFields) {
      const val = doc[field.legacy];
      if (typeof val === 'number' && Number.isFinite(val)) {
        casFilter[field.legacy] = val;
        try {
          const exact = convertToExactMoney(val, currency);
          if (doc[field.exact]) {
            if (!exactMoneyMatches(doc[field.exact], exact)) {
              hasConflict = true;
              conflictReason = `${field.exact} parity conflict`;
              fieldStats.conflicts++;
            } else {
              fieldStats.compliant++;
            }
          } else {
            casFilter[field.exact] = null;
            updates[field.exact] = exact;
            fieldsWritten.push(field.exact);
            hasNewWrites = true;
            fieldStats.wouldBackfill++;
          }
        } catch (err) {
          fieldStats.unresolved++;
          return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter };
        }
      }
    }

    // Order items
    if (Array.isArray(doc.items) && doc.items.length > 0) {
      casFilter.items = { $size: doc.items.length };
      let itemsUpdated = false;
      const updatedItems = doc.items.map((item, idx) => {
        const itemCopy = { ...(typeof item.toObject === 'function' ? item.toObject() : item) };
        if (typeof item.price === 'number' && Number.isFinite(item.price)) {
          const exact = convertToExactMoney(item.price, currency);
          if (item.unitPriceExact) {
            if (!exactMoneyMatches(item.unitPriceExact, exact)) {
              hasConflict = true;
              conflictReason = `items[${idx}].unitPriceExact parity conflict`;
              fieldStats.conflicts++;
            } else {
              fieldStats.compliant++;
            }
          } else {
            itemCopy.unitPriceExact = exact;
            fieldsWritten.push(`items.${idx}.unitPriceExact`);
            itemsUpdated = true;
            fieldStats.wouldBackfill++;
          }
        }
        if (typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)) {
          const exact = convertToExactMoney(item.lineTotal, currency);
          if (item.lineTotalExact) {
            if (!exactMoneyMatches(item.lineTotalExact, exact)) {
              hasConflict = true;
              conflictReason = `items[${idx}].lineTotalExact parity conflict`;
              fieldStats.conflicts++;
            } else {
              fieldStats.compliant++;
            }
          } else {
            itemCopy.lineTotalExact = exact;
            fieldsWritten.push(`items.${idx}.lineTotalExact`);
            itemsUpdated = true;
            fieldStats.wouldBackfill++;
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
      if (countryCode) {
        if (sa.countryCode !== countryCode) {
          saUpdates['shippingAddress.countryCode'] = countryCode;
          fieldsWritten.push('shippingAddress.countryCode');
          hasNewWrites = true;
          fieldStats.wouldBackfill++;
        } else {
          fieldStats.compliant++;
        }
      }

      const adminArea = sa.administrativeArea || sa.province || sa.state || '';
      if (adminArea) {
        if (sa.administrativeArea !== adminArea) {
          saUpdates['shippingAddress.administrativeArea'] = adminArea;
          fieldsWritten.push('shippingAddress.administrativeArea');
          hasNewWrites = true;
          fieldStats.wouldBackfill++;
        } else {
          fieldStats.compliant++;
        }
      }

      if (sa.phone) {
        if (!sa.phoneE164 || sa.phoneE164 === '') {
          const normalized = normalizePhone(sa.phone, countryCode || 'PK');
          if (normalized.phoneE164) {
            saUpdates['shippingAddress.phoneE164'] = normalized.phoneE164;
            fieldsWritten.push('shippingAddress.phoneE164');
            if (normalized.phoneExtension) {
              saUpdates['shippingAddress.phoneExtension'] = normalized.phoneExtension;
              fieldsWritten.push('shippingAddress.phoneExtension');
            }
            hasNewWrites = true;
            fieldStats.wouldBackfill++;
          }
        } else {
          fieldStats.compliant++;
        }
      }

      Object.assign(updates, saUpdates);
    }

    const preFingerprint = computeFingerprint({
      id: String(doc._id),
      currency,
      subtotal: doc.subtotal,
      shippingCost: doc.shippingCost,
      taxAmount: doc.taxAmount,
      discount: doc.discount,
      totalAmount: doc.totalAmount,
      subtotalExact: doc.subtotalExact,
      shippingCostExact: doc.shippingCostExact,
      taxAmountExact: doc.taxAmountExact,
      discountExact: doc.discountExact,
      totalAmountExact: doc.totalAmountExact,
      items: (doc.items || []).map(i => ({
        product: i.product ? String(i.product) : undefined,
        price: i.price,
        lineTotal: i.lineTotal,
        unitPriceExact: i.unitPriceExact,
        lineTotalExact: i.lineTotalExact
      })),
      shippingAddress: doc.shippingAddress
    });

    const postFingerprint = computeFingerprint(updates);

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten, fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
  },

  payments(doc, options = {}) {
    const currency = resolveCurrency(doc, 'payments', options);
    const fieldStats = {
      eligible: 0,
      compliant: 0,
      wouldBackfill: 0,
      conflicts: 0,
      unresolved: 0,
      inapplicable: 0
    };

    const fields = [
      { legacy: 'amount', exact: 'amountExact' },
      { legacy: 'paidAmount', exact: 'paidAmountExact' },
      { legacy: 'refundedAmount', exact: 'refundedAmountExact' },
      { legacy: 'refundReservedAmount', exact: 'refundReservedAmountExact' }
    ];

    for (const f of fields) {
      if (typeof doc[f.legacy] === 'number' && Number.isFinite(doc[f.legacy])) fieldStats.eligible++;
    }

    if (!currency) {
      fieldStats.unresolved = fieldStats.eligible;
      return {
        status: 'unresolved',
        reason: 'MISSING_CURRENCY',
        exactUpdates: {},
        fieldsWritten: [],
        fieldStats,
        casFilter: { _id: doc._id },
        preconditionFingerprint: computeFingerprint({ id: String(doc._id), currency: null }),
        postWriteFingerprint: computeFingerprint({})
      };
    }

    const updates = {};
    const fieldsWritten = [];
    const casFilter = { _id: doc._id };
    if (doc.__v !== undefined) casFilter.__v = doc.__v;

    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    for (const f of fields) {
      const val = doc[f.legacy];
      if (typeof val === 'number' && Number.isFinite(val)) {
        casFilter[f.legacy] = val;
        try {
          const exact = convertToExactMoney(val, currency);
          if (doc[f.exact]) {
            if (!exactMoneyMatches(doc[f.exact], exact)) {
              hasConflict = true;
              conflictReason = `${f.exact} parity conflict`;
              fieldStats.conflicts++;
            } else {
              fieldStats.compliant++;
            }
          } else {
            casFilter[f.exact] = null;
            updates[f.exact] = exact;
            fieldsWritten.push(f.exact);
            hasNewWrites = true;
            fieldStats.wouldBackfill++;
          }
        } catch (err) {
          fieldStats.unresolved++;
          return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter };
        }
      }
    }

    const preFingerprint = computeFingerprint({
      id: String(doc._id),
      currency,
      amount: doc.amount,
      paidAmount: doc.paidAmount,
      refundedAmount: doc.refundedAmount,
      refundReservedAmount: doc.refundReservedAmount,
      amountExact: doc.amountExact,
      paidAmountExact: doc.paidAmountExact,
      refundedAmountExact: doc.refundedAmountExact,
      refundReservedAmountExact: doc.refundReservedAmountExact
    });

    const postFingerprint = computeFingerprint(updates);

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten, fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
  },

  refunds(doc, options = {}) {
    const currency = resolveCurrency(doc, 'refunds', options);
    const fieldStats = {
      eligible: 0,
      compliant: 0,
      wouldBackfill: 0,
      conflicts: 0,
      unresolved: 0,
      inapplicable: 0
    };

    if (typeof doc.amount === 'number' && Number.isFinite(doc.amount)) fieldStats.eligible++;

    if (!currency) {
      fieldStats.unresolved = fieldStats.eligible;
      return {
        status: 'unresolved',
        reason: 'MISSING_CURRENCY',
        exactUpdates: {},
        fieldsWritten: [],
        fieldStats,
        casFilter: { _id: doc._id },
        preconditionFingerprint: computeFingerprint({ id: String(doc._id), currency: null }),
        postWriteFingerprint: computeFingerprint({})
      };
    }

    const updates = {};
    const fieldsWritten = [];
    const casFilter = { _id: doc._id };
    if (doc.__v !== undefined) casFilter.__v = doc.__v;

    if (typeof doc.amount === 'number' && Number.isFinite(doc.amount)) {
      casFilter.amount = doc.amount;
      try {
        const exact = convertToExactMoney(doc.amount, currency);
        const preFingerprint = computeFingerprint({
          id: String(doc._id),
          currency,
          amount: doc.amount,
          amountExact: doc.amountExact
        });

        if (doc.amountExact) {
          if (!exactMoneyMatches(doc.amountExact, exact)) {
            fieldStats.conflicts++;
            return {
              status: 'conflict',
              reason: `amountExact parity conflict (legacy: ${doc.amount}, exact: ${doc.amountExact.amountMinor})`,
              exactUpdates: {},
              fieldsWritten: [],
              fieldStats,
              casFilter,
              preconditionFingerprint: preFingerprint,
              postWriteFingerprint: computeFingerprint({})
            };
          }
          fieldStats.compliant++;
          return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: computeFingerprint({}) };
        } else {
          casFilter.amountExact = null;
          updates.amountExact = exact;
          fieldsWritten.push('amountExact');
          fieldStats.wouldBackfill++;
          const postFingerprint = computeFingerprint(updates);
          return { status: 'would_update', exactUpdates: updates, fieldsWritten, fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
        }
      } catch (err) {
        fieldStats.unresolved++;
        return { status: 'unresolved', reason: err.message, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter };
      }
    }

    fieldStats.unresolved++;
    return { status: 'unresolved', reason: 'INVALID_REFUND_AMOUNT', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter };
  },

  returns(doc, options = {}) {
    const currency = resolveCurrency(doc, 'returns', options);
    const fieldStats = {
      eligible: 0,
      compliant: 0,
      wouldBackfill: 0,
      conflicts: 0,
      unresolved: 0,
      inapplicable: 0
    };

    if (typeof doc.refundAmount === 'number' && Number.isFinite(doc.refundAmount)) fieldStats.eligible++;
    if (typeof doc.shippingCost === 'number' && Number.isFinite(doc.shippingCost)) fieldStats.eligible++;
    if (Array.isArray(doc.items)) {
      doc.items.forEach(item => {
        if (typeof item.price === 'number' && Number.isFinite(item.price)) fieldStats.eligible++;
        if (typeof item.refundAmount === 'number' && Number.isFinite(item.refundAmount)) fieldStats.eligible++;
      });
    }

    if (!currency) {
      fieldStats.unresolved = fieldStats.eligible;
      return {
        status: 'unresolved',
        reason: 'MISSING_CURRENCY',
        exactUpdates: {},
        fieldsWritten: [],
        fieldStats,
        casFilter: { _id: doc._id },
        preconditionFingerprint: computeFingerprint({ id: String(doc._id), currency: null }),
        postWriteFingerprint: computeFingerprint({})
      };
    }

    const updates = {};
    const fieldsWritten = [];
    const casFilter = { _id: doc._id };
    if (doc.__v !== undefined) casFilter.__v = doc.__v;

    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    if (typeof doc.refundAmount === 'number' && Number.isFinite(doc.refundAmount)) {
      casFilter.refundAmount = doc.refundAmount;
      const exact = convertToExactMoney(doc.refundAmount, currency);
      if (doc.refundAmountExact) {
        if (!exactMoneyMatches(doc.refundAmountExact, exact)) {
          hasConflict = true;
          conflictReason = 'refundAmountExact parity conflict';
          fieldStats.conflicts++;
        } else {
          fieldStats.compliant++;
        }
      } else {
        casFilter.refundAmountExact = null;
        updates.refundAmountExact = exact;
        fieldsWritten.push('refundAmountExact');
        hasNewWrites = true;
        fieldStats.wouldBackfill++;
      }
    }

    if (typeof doc.shippingCost === 'number' && Number.isFinite(doc.shippingCost)) {
      casFilter.shippingCost = doc.shippingCost;
      const exact = convertToExactMoney(doc.shippingCost, currency);
      if (doc.shippingCostExact) {
        if (!exactMoneyMatches(doc.shippingCostExact, exact)) {
          hasConflict = true;
          conflictReason = 'shippingCostExact parity conflict';
          fieldStats.conflicts++;
        } else {
          fieldStats.compliant++;
        }
      } else {
        casFilter.shippingCostExact = null;
        updates.shippingCostExact = exact;
        fieldsWritten.push('shippingCostExact');
        hasNewWrites = true;
        fieldStats.wouldBackfill++;
      }
    }

    if (Array.isArray(doc.items) && doc.items.length > 0) {
      casFilter.items = { $size: doc.items.length };
      let itemsUpdated = false;
      const updatedItems = doc.items.map((item, idx) => {
        const itemCopy = { ...(typeof item.toObject === 'function' ? item.toObject() : item) };
        if (typeof item.price === 'number' && Number.isFinite(item.price)) {
          const exact = convertToExactMoney(item.price, currency);
          if (item.priceExact) {
            if (!exactMoneyMatches(item.priceExact, exact)) {
              hasConflict = true;
              conflictReason = `items[${idx}].priceExact parity conflict`;
              fieldStats.conflicts++;
            } else {
              fieldStats.compliant++;
            }
          } else {
            itemCopy.priceExact = exact;
            fieldsWritten.push(`items.${idx}.priceExact`);
            itemsUpdated = true;
            fieldStats.wouldBackfill++;
          }
        }
        if (typeof item.refundAmount === 'number' && Number.isFinite(item.refundAmount)) {
          const exact = convertToExactMoney(item.refundAmount, currency);
          if (item.refundAmountExact) {
            if (!exactMoneyMatches(item.refundAmountExact, exact)) {
              hasConflict = true;
              conflictReason = `items[${idx}].refundAmountExact parity conflict`;
              fieldStats.conflicts++;
            } else {
              fieldStats.compliant++;
            }
          } else {
            itemCopy.refundAmountExact = exact;
            fieldsWritten.push(`items.${idx}.refundAmountExact`);
            itemsUpdated = true;
            fieldStats.wouldBackfill++;
          }
        }
        return itemCopy;
      });

      if (itemsUpdated) {
        updates.items = updatedItems;
        hasNewWrites = true;
      }
    }

    const preFingerprint = computeFingerprint({
      id: String(doc._id),
      currency,
      refundAmount: doc.refundAmount,
      shippingCost: doc.shippingCost,
      refundAmountExact: doc.refundAmountExact,
      shippingCostExact: doc.shippingCostExact,
      items: (doc.items || []).map(i => ({
        product: i.product ? String(i.product) : undefined,
        price: i.price,
        refundAmount: i.refundAmount,
        priceExact: i.priceExact,
        refundAmountExact: i.refundAmountExact
      }))
    });

    const postFingerprint = computeFingerprint(updates);

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten, fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
  },

  coupons(doc, options = {}) {
    const currency = resolveCurrency(doc, 'coupons', options);
    const fieldStats = {
      eligible: 0,
      compliant: 0,
      wouldBackfill: 0,
      conflicts: 0,
      unresolved: 0,
      inapplicable: 0
    };

    if (doc.type === 'fixed' && typeof doc.value === 'number' && Number.isFinite(doc.value)) {
      fieldStats.eligible++;
    } else if (doc.type === 'percentage') {
      fieldStats.inapplicable++;
    }

    if (typeof doc.minOrderAmount === 'number' && Number.isFinite(doc.minOrderAmount) && doc.minOrderAmount > 0) fieldStats.eligible++;
    if (typeof doc.maxDiscount === 'number' && Number.isFinite(doc.maxDiscount) && doc.maxDiscount > 0) fieldStats.eligible++;

    if (!currency) {
      fieldStats.unresolved = fieldStats.eligible;
      return {
        status: 'unresolved',
        reason: 'MISSING_CURRENCY',
        exactUpdates: {},
        fieldsWritten: [],
        fieldStats,
        casFilter: { _id: doc._id },
        preconditionFingerprint: computeFingerprint({ id: String(doc._id), currency: null }),
        postWriteFingerprint: computeFingerprint({})
      };
    }

    const updates = {};
    const fieldsWritten = [];
    const casFilter = { _id: doc._id };
    if (doc.__v !== undefined) casFilter.__v = doc.__v;

    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    // Fixed-value coupons get valueExact; percentage coupons MUST NOT have valueExact
    if (doc.type === 'fixed' && typeof doc.value === 'number' && Number.isFinite(doc.value)) {
      casFilter.value = doc.value;
      const exact = convertToExactMoney(doc.value, currency);
      if (doc.valueExact) {
        if (!exactMoneyMatches(doc.valueExact, exact)) {
          hasConflict = true;
          conflictReason = 'valueExact parity conflict for fixed coupon';
          fieldStats.conflicts++;
        } else {
          fieldStats.compliant++;
        }
      } else {
        casFilter.valueExact = null;
        updates.valueExact = exact;
        fieldsWritten.push('valueExact');
        hasNewWrites = true;
        fieldStats.wouldBackfill++;
      }
    }

    if (typeof doc.minOrderAmount === 'number' && Number.isFinite(doc.minOrderAmount) && doc.minOrderAmount > 0) {
      casFilter.minOrderAmount = doc.minOrderAmount;
      const exact = convertToExactMoney(doc.minOrderAmount, currency);
      if (doc.minOrderAmountExact) {
        if (!exactMoneyMatches(doc.minOrderAmountExact, exact)) {
          hasConflict = true;
          conflictReason = 'minOrderAmountExact parity conflict';
          fieldStats.conflicts++;
        } else {
          fieldStats.compliant++;
        }
      } else {
        casFilter.minOrderAmountExact = null;
        updates.minOrderAmountExact = exact;
        fieldsWritten.push('minOrderAmountExact');
        hasNewWrites = true;
        fieldStats.wouldBackfill++;
      }
    }

    if (typeof doc.maxDiscount === 'number' && Number.isFinite(doc.maxDiscount) && doc.maxDiscount > 0) {
      casFilter.maxDiscount = doc.maxDiscount;
      const exact = convertToExactMoney(doc.maxDiscount, currency);
      if (doc.maxDiscountExact) {
        if (!exactMoneyMatches(doc.maxDiscountExact, exact)) {
          hasConflict = true;
          conflictReason = 'maxDiscountExact parity conflict';
          fieldStats.conflicts++;
        } else {
          fieldStats.compliant++;
        }
      } else {
        casFilter.maxDiscountExact = null;
        updates.maxDiscountExact = exact;
        fieldsWritten.push('maxDiscountExact');
        hasNewWrites = true;
        fieldStats.wouldBackfill++;
      }
    }

    const preFingerprint = computeFingerprint({
      id: String(doc._id),
      currency,
      type: doc.type,
      value: doc.value,
      valueExact: doc.valueExact,
      minOrderAmount: doc.minOrderAmount,
      minOrderAmountExact: doc.minOrderAmountExact,
      maxDiscount: doc.maxDiscount,
      maxDiscountExact: doc.maxDiscountExact
    });

    const postFingerprint = computeFingerprint(updates);

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten, fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
  },

  shipping_zones(doc, options = {}) {
    const currency = resolveCurrency(doc, 'shipping_zones', options);
    const fieldStats = {
      eligible: 0,
      compliant: 0,
      wouldBackfill: 0,
      conflicts: 0,
      unresolved: 0,
      inapplicable: 0
    };

    if (typeof doc.normalRate === 'number' && Number.isFinite(doc.normalRate)) fieldStats.eligible++;
    if (typeof doc.freeShippingThreshold === 'number' && Number.isFinite(doc.freeShippingThreshold)) fieldStats.eligible++;
    if (typeof doc.remoteRate === 'number' && Number.isFinite(doc.remoteRate)) fieldStats.eligible++;

    if (!currency) {
      fieldStats.unresolved = fieldStats.eligible;
      return {
        status: 'unresolved',
        reason: 'MISSING_CURRENCY',
        exactUpdates: {},
        fieldsWritten: [],
        fieldStats,
        casFilter: { _id: doc._id },
        preconditionFingerprint: computeFingerprint({ id: String(doc._id), currency: null }),
        postWriteFingerprint: computeFingerprint({})
      };
    }

    const updates = {};
    const fieldsWritten = [];
    const casFilter = { _id: doc._id };
    if (doc.__v !== undefined) casFilter.__v = doc.__v;

    let hasConflict = false;
    let conflictReason = '';
    let hasNewWrites = false;

    if (typeof doc.normalRate === 'number' && Number.isFinite(doc.normalRate)) {
      casFilter.normalRate = doc.normalRate;
      const exact = convertToExactMoney(doc.normalRate, currency);
      if (doc.normalRateExact) {
        if (!exactMoneyMatches(doc.normalRateExact, exact)) {
          hasConflict = true;
          conflictReason = 'normalRateExact parity conflict';
          fieldStats.conflicts++;
        } else {
          fieldStats.compliant++;
        }
      } else {
        casFilter.normalRateExact = null;
        updates.normalRateExact = exact;
        fieldsWritten.push('normalRateExact');
        hasNewWrites = true;
        fieldStats.wouldBackfill++;
      }
    }

    if (typeof doc.freeShippingThreshold === 'number' && Number.isFinite(doc.freeShippingThreshold)) {
      casFilter.freeShippingThreshold = doc.freeShippingThreshold;
      const exact = convertToExactMoney(doc.freeShippingThreshold, currency);
      if (doc.freeShippingThresholdExact) {
        if (!exactMoneyMatches(doc.freeShippingThresholdExact, exact)) {
          hasConflict = true;
          conflictReason = 'freeShippingThresholdExact parity conflict';
          fieldStats.conflicts++;
        } else {
          fieldStats.compliant++;
        }
      } else {
        casFilter.freeShippingThresholdExact = null;
        updates.freeShippingThresholdExact = exact;
        fieldsWritten.push('freeShippingThresholdExact');
        hasNewWrites = true;
        fieldStats.wouldBackfill++;
      }
    }

    if (typeof doc.remoteRate === 'number' && Number.isFinite(doc.remoteRate)) {
      casFilter.remoteRate = doc.remoteRate;
      const exact = convertToExactMoney(doc.remoteRate, currency);
      if (doc.remoteRateExact) {
        if (!exactMoneyMatches(doc.remoteRateExact, exact)) {
          hasConflict = true;
          conflictReason = 'remoteRateExact parity conflict';
          fieldStats.conflicts++;
        } else {
          fieldStats.compliant++;
        }
      } else {
        casFilter.remoteRateExact = null;
        updates.remoteRateExact = exact;
        fieldsWritten.push('remoteRateExact');
        hasNewWrites = true;
        fieldStats.wouldBackfill++;
      }
    }

    const preFingerprint = computeFingerprint({
      id: String(doc._id),
      currency,
      normalRate: doc.normalRate,
      freeShippingThreshold: doc.freeShippingThreshold,
      remoteRate: doc.remoteRate,
      normalRateExact: doc.normalRateExact,
      freeShippingThresholdExact: doc.freeShippingThresholdExact,
      remoteRateExact: doc.remoteRateExact
    });

    const postFingerprint = computeFingerprint(updates);

    if (hasConflict) {
      return { status: 'conflict', reason: conflictReason, exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten, fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
  },

  users(doc, options = {}) {
    const updates = {};
    const fieldsWritten = [];
    const casFilter = { _id: doc._id };
    if (doc.__v !== undefined) casFilter.__v = doc.__v;

    const fieldStats = {
      eligible: 0,
      compliant: 0,
      wouldBackfill: 0,
      conflicts: 0,
      unresolved: 0,
      inapplicable: 0
    };

    let hasNewWrites = false;

    if (Array.isArray(doc.addresses) && doc.addresses.length > 0) {
      casFilter.addresses = { $size: doc.addresses.length };
      let addressesUpdated = false;
      const updatedAddresses = doc.addresses.map((addr, idx) => {
        const addrCopy = { ...(typeof addr.toObject === 'function' ? addr.toObject() : addr) };
        if (addr.country || addr.countryCode) fieldStats.eligible++;
        if (addr.administrativeArea || addr.state || addr.province) fieldStats.eligible++;
        if (addr.phone) fieldStats.eligible++;

        const countryCode = resolveCountryCode(addr.countryCode || addr.country, options);
        if (countryCode) {
          if (addr.countryCode !== countryCode) {
            addrCopy.countryCode = countryCode;
            fieldsWritten.push(`addresses.${idx}.countryCode`);
            addressesUpdated = true;
            fieldStats.wouldBackfill++;
          } else {
            fieldStats.compliant++;
          }
        }

        const adminArea = addr.administrativeArea || addr.state || addr.province || '';
        if (adminArea) {
          if (addr.administrativeArea !== adminArea) {
            addrCopy.administrativeArea = adminArea;
            fieldsWritten.push(`addresses.${idx}.administrativeArea`);
            addressesUpdated = true;
            fieldStats.wouldBackfill++;
          } else {
            fieldStats.compliant++;
          }
        }

        if (addr.phone) {
          if (!addr.phoneE164 || addr.phoneE164 === '') {
            const normalized = normalizePhone(addr.phone, countryCode || 'PK');
            if (normalized.phoneE164) {
              addrCopy.phoneE164 = normalized.phoneE164;
              fieldsWritten.push(`addresses.${idx}.phoneE164`);
              if (normalized.phoneExtension) {
                addrCopy.phoneExtension = normalized.phoneExtension;
                fieldsWritten.push(`addresses.${idx}.phoneExtension`);
              }
              addressesUpdated = true;
              fieldStats.wouldBackfill++;
            }
          } else {
            fieldStats.compliant++;
          }
        }

        return addrCopy;
      });

      if (addressesUpdated) {
        updates.addresses = updatedAddresses;
        hasNewWrites = true;
      }
    }

    const preFingerprint = computeFingerprint({
      id: String(doc._id),
      addresses: doc.addresses
    });

    const postFingerprint = computeFingerprint(updates);

    if (!hasNewWrites) {
      return { status: 'already_compliant', exactUpdates: {}, fieldsWritten: [], fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
    }

    return { status: 'would_update', exactUpdates: updates, fieldsWritten, fieldStats, casFilter, preconditionFingerprint: preFingerprint, postWriteFingerprint: postFingerprint };
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
  canonicalizeValue,
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

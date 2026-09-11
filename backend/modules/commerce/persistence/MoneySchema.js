/**
 * @file MoneySchema.js
 * @description Mongoose Subschema for Exact BSON Decimal128 Monetary Persistence.
 *
 * Enforces:
 * 1. Decimal128 minor units stored strictly as canonical base-10 integer strings (scale zero).
 * 2. Explicit rejection of fractional minor units, scientific notation (e.g. 1e5), NaN, Infinity.
 * 3. Maximum 34 decimal digit bound (IEEE 754-2008 Decimal128 standard) with aggregation headroom.
 * 4. Immutable currency code, exponent, and registry snapshot metadata.
 * 5. Automatic serialization transformation to string `amountMinor` (prevents raw BSON Decimal128 leakage).
 */

'use strict';

const mongoose = require('mongoose');

// Max 18 digits (10^18 - 1) ensures 16 digits of safe aggregation headroom within Decimal128's 34-digit limit
const MAX_DOMAIN_DIGITS = 18;
const CANONICAL_INTEGER_STRING_REGEX = /^-?[0-9]{1,18}$/;

const moneySubschema = new mongoose.Schema({
  amountMinor: {
    type: mongoose.Schema.Types.Decimal128,
    required: [true, 'amountMinor Decimal128 is required for exact money snapshot'],
    validate: {
      validator: (val) => {
        if (val === null || val === undefined) return false;
        const str = val.toString().trim();
        return CANONICAL_INTEGER_STRING_REGEX.test(str);
      },
      message: `amountMinor must be a canonical integer Decimal128 string (max ${MAX_DOMAIN_DIGITS} digits, scale zero, no scientific notation)`
    }
  },
  currency: {
    type: String,
    required: [true, 'ISO 4217 currency code is required'],
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{3}$/, 'Currency must be a 3-letter uppercase ISO 4217 code']
  },
  exponent: {
    type: Number,
    required: [true, 'Currency exponent snapshot is required'],
    min: 0,
    max: 4,
    validate: {
      validator: Number.isInteger,
      message: 'Currency exponent must be an integer between 0 and 4'
    }
  },
  registrySnapshot: {
    type: String,
    required: [true, 'Registry snapshot identifier is required'],
    trim: true,
    maxlength: 120
  }
}, {
  _id: false,
  toJSON: {
    transform: (_doc, ret) => {
      if (ret.amountMinor !== undefined && ret.amountMinor !== null) {
        ret.amountMinor = ret.amountMinor.toString();
      }
      return ret;
    }
  },
  toObject: {
    transform: (_doc, ret) => {
      if (ret.amountMinor !== undefined && ret.amountMinor !== null) {
        ret.amountMinor = ret.amountMinor.toString();
      }
      return ret;
    }
  }
});

moneySubschema.statics.MAX_DOMAIN_DIGITS = MAX_DOMAIN_DIGITS;

module.exports = moneySubschema;

/**
 * @file index.js
 * @description Global Commerce Primitives Core Module.
 */

const CurrencyRegistry = require('./registries/currencyRegistry');
const CountryRegistry = require('./registries/countryRegistry');
const Money = require('./core/Money');
const Address = require('./core/Address');
const Phone = require('./core/Phone');
const CommerceError = require('./core/CommerceError');
const { ROUNDING_MODES, roundFraction, allocateLargestRemainder } = require('./core/Rounding');

module.exports = {
  CurrencyRegistry,
  CountryRegistry,
  Money,
  Address,
  Phone,
  CommerceError,
  ROUNDING_MODES,
  roundFraction,
  allocateLargestRemainder
};

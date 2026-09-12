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
const MoneySchema = require('./persistence/MoneySchema');
const MoneyMapper = require('./persistence/MoneyMapper');
const RolloutAuthority = require('./persistence/RolloutAuthority');
const { ExactMoneyMigrationRegistry, ExactMoneyMigrationService } = require('./migration');

module.exports = {
  CurrencyRegistry,
  CountryRegistry,
  Money,
  Address,
  Phone,
  CommerceError,
  ROUNDING_MODES,
  roundFraction,
  allocateLargestRemainder,
  MoneySchema,
  MoneyMapper,
  RolloutAuthority,
  ExactMoneyMigrationRegistry,
  ExactMoneyMigrationService
};

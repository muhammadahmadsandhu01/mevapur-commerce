'use strict';

const ExactMoneyMigrationRegistry = require('./ExactMoneyMigrationRegistry');
const ExactMoneyMigrationService = require('./ExactMoneyMigrationService');

module.exports = {
  ExactMoneyMigrationRegistry,
  ExactMoneyMigrationService,
  CANONICAL_MIGRATION_ID: ExactMoneyMigrationRegistry.CANONICAL_MIGRATION_ID,
  MIGRATION_TOOL_VERSION: ExactMoneyMigrationRegistry.MIGRATION_TOOL_VERSION
};

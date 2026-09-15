/**
 * @file phase6d2-inventory-migration.unit.test.js
 * @description Unit tests for Phase 6D-2 migration script structure, index definitions,
 * guard confirmation flag enforcement, and inert module import.
 */

const migration = require('../../scripts/migrations/phase6d2-multi-origin-inventory');

describe('Phase 6D-2: Inventory Migration Unit Tests', () => {
  it('imports the migration module in an inert, non-executing manner', () => {
    expect(migration.MIGRATION_ID).toBe('phase6d2-multi-origin-inventory');
    expect(Array.isArray(migration.TARGET_INDEXES)).toBe(true);
    expect(migration.TARGET_INDEXES.length).toBeGreaterThanOrEqual(14);
  });

  it('defines unique indexes for FulfillmentLocation and InventoryPosition', () => {
    const locUnique = migration.TARGET_INDEXES.find((idx) => idx.name === 'unique_tenant_location_code');
    expect(locUnique).toBeDefined();
    expect(locUnique.options.unique).toBe(true);

    const posUnique = migration.TARGET_INDEXES.find((idx) => idx.name === 'unique_tenant_location_product_scope');
    expect(posUnique).toBeDefined();
    expect(posUnique.options.unique).toBe(true);

    const ledgerUnique = migration.TARGET_INDEXES.find((idx) => idx.name === 'unique_inventory_ledger_idempotency');
    expect(ledgerUnique).toBeDefined();
    expect(ledgerUnique.options.unique).toBe(true);
  });

  it('correctly matches existing index keys using findIndexMatch', () => {
    const existing = [
      { name: '_id_', key: { _id: 1 } },
      { name: 'unique_tenant_location_code', key: { merchantScopeId: 1, locationCode: 1 } }
    ];

    const target = {
      name: 'unique_tenant_location_code',
      key: { merchantScopeId: 1, locationCode: 1 }
    };

    const match = migration.findIndexMatch(existing, target);
    expect(match).toBeDefined();
    expect(match.name).toBe('unique_tenant_location_code');
  });

  it('throws MigrationGuardError when required confirmation flags are absent in apply mode', async () => {
    await expect(migration.runMigration(['--apply', '--target=local', '--allow-local'])).rejects.toThrow(
      /Missing required confirmation flag '--confirm-phase6d2-apply'/
    );
  });
});

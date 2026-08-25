const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const backendPackage = require('../../package.json');
const Role = require('../../models/Role');
const Permission = require('../../models/Permission');
const {
  DEFAULT_PERMISSIONS,
  buildRoleDefinitions
} = require('../../database/seeders/roleSeeder');

const backendRoot = path.resolve(__dirname, '../..');

describe('Phase 1H release hygiene', () => {
  test('the npm seed command targets the guarded existing entry point', () => {
    expect(backendPackage.scripts.seed).toBe('node database/seeders/index.js');
    expect(fs.existsSync(path.join(backendRoot, 'database/seeders/index.js'))).toBe(true);
  });

  test('importing the seeder entry point does not connect or seed', () => {
    const script = [
      "const mongoose = require('mongoose');",
      'let connected = false;',
      'mongoose.connect = () => { connected = true; };',
      "require('./database/seeders/index.js');",
      'process.exit(connected ? 2 : 0);'
    ].join(' ');

    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: backendRoot,
      env: { ...process.env, LOG_FILE_ENABLED: 'false', MONGODB_URI: '' },
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
  });

  test('direct seeder execution refuses missing configuration before connecting', () => {
    const result = spawnSync(
      process.execPath,
      ['database/seeders/index.js'],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          LOG_FILE_ENABLED: 'false',
          MONGODB_URI: ''
        },
        encoding: 'utf8'
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain('SEEDER_DATABASE_URI_REQUIRED');
  });

  test('Role declares exactly one unique name index', () => {
    const nameIndexes = Role.schema.indexes().filter(([keys]) => (
      Object.keys(keys).length === 1 && keys.name === 1
    ));

    expect(nameIndexes).toHaveLength(1);
    expect(nameIndexes[0][1].unique).toBe(true);
  });

  test('role definitions contain valid least-privilege permission sets', () => {
    const moduleValues = new Set(Permission.schema.path('module').enumValues);
    const actionValues = new Set(Permission.schema.path('action').enumValues);
    const permissionRecords = DEFAULT_PERMISSIONS.map((permission, index) => ({
      ...permission,
      _id: `permission-${index}`
    }));
    const roles = buildRoleDefinitions(permissionRecords);
    const byName = Object.fromEntries(roles.map((role) => [role.name, role]));
    const permissionById = new Map(permissionRecords.map((permission) => [
      permission._id,
      permission
    ]));

    for (const permission of DEFAULT_PERMISSIONS) {
      expect(moduleValues.has(permission.module)).toBe(true);
      expect(actionValues.has(permission.action)).toBe(true);
    }

    expect(byName.SUPER_ADMIN.permissions).toHaveLength(DEFAULT_PERMISSIONS.length);
    expect(byName.ADMIN.permissions.every((id) => permissionById.get(id).scope === 'all')).toBe(true);
    expect(byName.CUSTOMER.permissions).toHaveLength(3);
    expect(byName.CUSTOMER.permissions.every((id) => permissionById.get(id).scope === 'own')).toBe(true);
    expect(roles.every((role) => role.isSystem && role.isActive)).toBe(true);
  });
});

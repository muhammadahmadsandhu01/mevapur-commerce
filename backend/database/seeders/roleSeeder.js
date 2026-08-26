const Role = require('../../models/Role');
const Permission = require('../../models/Permission');
const logger = require('../../common/utils/logger');

const DEFAULT_PERMISSIONS = Object.freeze([
  { module: 'order', resource: 'orders', action: 'read', scope: 'own' },
  { module: 'order', resource: 'orders', action: 'create', scope: 'own' },
  { module: 'order', resource: 'orders', action: 'update', scope: 'own' },
  
  { module: 'order', resource: 'orders', action: 'read', scope: 'all' },
  { module: 'order', resource: 'orders', action: 'refund', scope: 'all' },
  
  { module: 'product', resource: 'products', action: 'read', scope: 'all' },
  { module: 'product', resource: 'products', action: 'create', scope: 'all' },
  { module: 'product', resource: 'products', action: 'update', scope: 'all' },
  { module: 'product', resource: 'products', action: 'delete', scope: 'all' },
  
  { module: 'user', resource: 'users', action: 'read', scope: 'all' },
  { module: 'user', resource: 'users', action: 'manage', scope: 'all' },
  
  { module: 'inventory', resource: 'inventory', action: 'update', scope: 'all' },
  { module: 'setting', resource: 'settings', action: 'manage', scope: 'all' }
]);

const buildRoleDefinitions = (permissions) => {
  const permissionIds = (scope) => permissions
    .filter((permission) => !scope || permission.scope === scope)
    .map((permission) => permission._id);

  return [
    {
      name: 'SUPER_ADMIN',
      description: 'Full system access',
      permissions: permissionIds(),
      isSystem: true,
      isActive: true
    },
    {
      name: 'ADMIN',
      description: 'Manage orders, products, and users',
      permissions: permissionIds('all'),
      isSystem: true,
      isActive: true
    },
    {
      name: 'CUSTOMER',
      description: 'Standard customer access',
      permissions: permissionIds('own'),
      isSystem: true,
      isActive: true
    }
  ];
};

async function seedRoles() {
  try {
    // Create Permissions first
    const createdPermissions = [];
    for (const perm of DEFAULT_PERMISSIONS) {
      const p = await Permission.findOne(perm);
      if (!p) {
        const newPerm = await Permission.create(perm);
        createdPermissions.push(newPerm);
        logger.info(`Permission created: ${perm.resource}:${perm.action}:${perm.scope}`);
      } else {
        createdPermissions.push(p);
      }
    }

    const roles = buildRoleDefinitions(createdPermissions);

    for (const role of roles) {
      await Role.findOneAndUpdate(
        { name: role.name },
        { $set: role },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true
        }
      );
      logger.info(`Role reconciled: ${role.name}`);
    }

    logger.info('Role seeding completed successfully');
  } catch (error) {
    logger.error('Error seeding roles:', error);
    throw error;
  }
}

module.exports = {
  DEFAULT_PERMISSIONS,
  buildRoleDefinitions,
  seedRoles
};

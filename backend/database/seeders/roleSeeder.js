const Role = require('../../models/Role');
const Permission = require('../../models/Permission');
const { logger } = require('../../common/logger');

const defaultPermissions = [
  { resource: 'orders', action: 'read', scope: 'own' },
  { resource: 'orders', action: 'create', scope: 'own' },
  { resource: 'orders', action: 'update', scope: 'own' },
  { resource: 'orders', action: 'cancel', scope: 'own' },
  
  { resource: 'orders', action: 'read', scope: 'all' }, // Admin
  { resource: 'orders', action: 'refund', scope: 'all' }, // Admin
  
  { resource: 'products', action: 'read', scope: 'all' },
  { resource: 'products', action: 'create', scope: 'all' },
  { resource: 'products', action: 'update', scope: 'all' },
  { resource: 'products', action: 'delete', scope: 'all' },
  
  { resource: 'users', action: 'read', scope: 'all' },
  { resource: 'users', action: 'manage', scope: 'all' },
  
  { resource: 'inventory', action: 'update', scope: 'all' },
  { resource: 'settings', action: 'manage', scope: 'all' }
];

async function seedRoles() {
  try {
    // Create Permissions first
    const createdPermissions = [];
    for (const perm of defaultPermissions) {
      const p = await Permission.findOne(perm);
      if (!p) {
        const newPerm = await Permission.create(perm);
        createdPermissions.push(newPerm._id);
        logger.info(`Permission created: ${perm.resource}:${perm.action}:${perm.scope}`);
      } else {
        createdPermissions.push(p._id);
      }
    }

    // Define Roles
    const roles = [
      {
        name: 'SUPER_ADMIN',
        description: 'Full system access',
        permissions: createdPermissions,
        isSystemRole: true
      },
      {
        name: 'ADMIN',
        description: 'Manage orders, products, and users',
        permissions: createdPermissions.filter(p => 
          // Filter logic can be refined based on specific IDs if needed
          true // For now, giving broad access, refine as needed
        ),
        isSystemRole: true
      },
      {
        name: 'CUSTOMER',
        description: 'Standard customer access',
        permissions: createdPermissions.filter(p => p.scope === 'own'),
        isSystemRole: true
      }
    ];

    for (const role of roles) {
      const existingRole = await Role.findOne({ name: role.name });
      if (!existingRole) {
        await Role.create(role);
        logger.info(`Role created: ${role.name}`);
      } else {
        logger.info(`Role already exists: ${role.name}`);
      }
    }

    logger.info('Role seeding completed successfully');
  } catch (error) {
    logger.error('Error seeding roles:', error);
    throw error;
  }
}

module.exports = { seedRoles };